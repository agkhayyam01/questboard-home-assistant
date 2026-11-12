import json
import os
import re
import subprocess
import threading
import time
from contextlib import contextmanager
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urljoin, urlsplit
from uuid import uuid4

import httpx
import pytest


PREFIX = "/api/hassio_ingress/test-token/"


def docker(*args, check=True):
    return subprocess.run(
        ["docker", *args], check=check, capture_output=True, text=True, timeout=120
    )


@contextmanager
def container(image, volume):
    name = f"questboard-test-{uuid4().hex}"
    try:
        docker(
            "run", "-d", "--name", name,
            "-p", "127.0.0.1::8099",
            "--mount", f"type=volume,source={volume},target=/data",
            image,
        )
        port = docker("port", name, "8099/tcp").stdout.strip().rsplit(":", 1)[1]
        url = f"http://127.0.0.1:{port}"
        for _ in range(120):
            try:
                if httpx.get(url + "/api/profiles", timeout=0.5).status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(0.25)
        else:
            pytest.fail(f"Container did not become ready:\n{docker('logs', name, check=False).stdout}\n"
                        f"{docker('logs', name, check=False).stderr}")
        yield name, url
    finally:
        docker("rm", "-f", name, check=False)


@contextmanager
def ingress_proxy(upstream):
    class Proxy(BaseHTTPRequestHandler):
        def forward(self):
            if not self.path.startswith(PREFIX):
                self.send_error(404)
                return
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            headers = {key: value for key, value in self.headers.items()
                       if key.lower() not in ("host", "connection", "content-length")}
            response = httpx.request(
                self.command, upstream + "/" + self.path[len(PREFIX):],
                content=body, headers=headers, timeout=5,
            )
            self.send_response(response.status_code)
            for key, value in response.headers.items():
                if key.lower() not in ("content-length", "transfer-encoding", "connection", "content-encoding"):
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(response.content)))
            self.end_headers()
            self.wfile.write(response.content)

        do_GET = do_POST = do_PATCH = forward

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}{PREFIX}"
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and "src" in attrs:
            self.urls.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.urls.append(attrs["href"])


def database_state(name):
    code = """
import json, sqlite3
db = sqlite3.connect('/data/questboard.sqlite3')
print(json.dumps({
    'profile': db.execute("SELECT name, color, chests FROM profiles WHERE id='remy'").fetchone(),
    'inventory': db.execute("SELECT item_id, equipped, placed FROM inventory WHERE profile_id='remy' ORDER BY item_id").fetchall(),
    'events': db.execute("SELECT source, event_id, profile_id FROM reward_events WHERE profile_id='remy' ORDER BY event_id").fetchall(),
}))
"""
    return json.loads(docker("exec", name, "python", "-c", code).stdout)


def test_addon_image_ingress_and_volume_restart():
    image = os.environ.get("QUESTBOARD_TEST_IMAGE")
    if not image:
        pytest.skip("Set QUESTBOARD_TEST_IMAGE to a locally built image to run Docker integration")
    platform = os.environ.get("QUESTBOARD_TEST_IMAGE_PLATFORM")
    actual_platform = docker("image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", image).stdout.strip()
    if platform:
        assert actual_platform == platform

    volume = f"questboard-test-{uuid4().hex}"
    docker("volume", "create", volume)
    try:
        with container(image, volume) as (name, upstream), ingress_proxy(upstream) as base:
            with httpx.Client() as client:
                page = client.get(base)
                page.raise_for_status()
                assets = Assets()
                assets.feed(page.text)
                assert any(urlsplit(asset).path.endswith(".js") for asset in assets.urls)
                assert any(urlsplit(asset).path.endswith(".css") for asset in assets.urls)
                for asset in assets.urls:
                    resolved = urljoin(base, asset)
                    assert resolved.startswith(base), asset
                    response = client.get(resolved)
                    response.raise_for_status()
                    assert response.content
                    if urlsplit(asset).path.endswith(".js"):
                        assert re.search(r"fetch\(\s*[`'\"]api/", response.text)

                assert client.get(urljoin(base, "missing.js")).status_code == 404
                assert client.get(urljoin(base, "api/not-a-route")).status_code == 404
                assert client.get(urljoin(base, "room")).text == page.text
                profile = urljoin(base, "api/profiles/remy")
                client.patch(profile, json={"name": "Docker restart", "color": "#abcdef"}).raise_for_status()
                headers = {"Idempotency-Key": "docker-restart"}
                client.post(profile + "/simulate-reward", headers=headers).raise_for_status()
                chest = client.post(profile + "/open-chest")
                chest.raise_for_status()
                item = chest.json()["item"]
                attribute = "equipped" if item["category"] in ("outfit", "accessory") else "placed"
                client.post(profile + "/items/" + item["id"], json={attribute: True}).raise_for_status()
                client.post(profile + "/simulate-reward", headers={"Idempotency-Key": "remaining"}).raise_for_status()
                before = client.get(profile).json()
                assert before["profile"]["chests"] == 1
                assert next(i for i in before["items"] if i["id"] == item["id"])[attribute]

            state = database_state(name)
            assert state["profile"] == ["Docker restart", "#abcdef", 1]
            assert state["inventory"] == [[item["id"], int(attribute == "equipped"), int(attribute == "placed")]]
            assert state["events"] == [["simulated", "docker-restart", "remy"], ["simulated", "remaining", "remy"]]

        with container(image, volume) as (name, upstream), ingress_proxy(upstream) as base:
            assert database_state(name) == state
            with httpx.Client() as client:
                profile = urljoin(base, "api/profiles/remy")
                response = client.get(profile)
                response.raise_for_status()
                assert response.json() == before
                retry = client.post(profile + "/simulate-reward", headers=headers)
                retry.raise_for_status()
                assert retry.json()["chests"] == 1
                assert client.post(urljoin(base, "api/profiles/gigi/simulate-reward"), headers=headers).status_code == 409
                assert database_state(name) == state
    finally:
        docker("volume", "rm", "-f", volume, check=False)
