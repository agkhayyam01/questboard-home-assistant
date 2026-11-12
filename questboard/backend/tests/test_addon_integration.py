import os
import re
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx
import pytest
import yaml
from fastapi.testclient import TestClient

from backend.main import app


ADDON = Path(__file__).resolve().parents[2]
INGRESS = "/api/hassio_ingress/example-token/"


class UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        self.flatten_mapping(node)
        keys = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in keys:
                raise ValueError(f"Duplicate YAML key: {key}")
            keys.add(key)
        return super().construct_mapping(node, deep=deep)


def test_addon_config_matches_container_contract():
    config = yaml.load((ADDON / "config.yaml").read_text(), Loader=UniqueKeyLoader)
    assert isinstance(config, dict)
    for field in ("name", "version", "slug", "description"):
        assert isinstance(config.get(field), str) and config[field].strip(), field
    assert config["slug"] == "questboard"
    assert re.fullmatch(r"[a-z0-9_]+", config["slug"])
    architectures = config.get("arch")
    assert isinstance(architectures, list) and all(isinstance(arch, str) for arch in architectures)
    assert len(architectures) == len(set(architectures))
    assert set(architectures) <= {"aarch64", "amd64", "armhf", "armv7", "i386"}
    assert {"aarch64", "amd64"} <= set(architectures)

    assert config.get("startup", "application") == "application"
    assert config.get("boot", "auto") == "auto"
    assert config.get("ingress") is True
    ingress_port = config.get("ingress_port", 8099)
    assert type(ingress_port) is int and ingress_port == 8099
    assert config.get("init") is False
    assert config.get("host_network", False) is False
    assert config.get("ports", {}) == {}
    assert config.get("ports_description", {}) == {}
    environment = config.get("environment", {})
    assert isinstance(environment, dict) and environment.get("DATA_DIR", "/data") == "/data"
    mappings = config.get("map", [])
    assert isinstance(mappings, list)
    assert all(not isinstance(entry, dict) or entry.get("path") != "/data" for entry in mappings)

    dockerfile = (ADDON / "Dockerfile").read_text()
    assert re.search(r"^ENV DATA_DIR=/data\s*$", dockerfile, re.MULTILINE)
    assert re.search(r"^EXPOSE 8099\s*$", dockerfile, re.MULTILINE)
    assert re.search(r'^CMD \["uvicorn", "backend\.main:app", "--host", "0\.0\.0\.0", "--port", "8099"\]\s*$', dockerfile, re.MULTILINE)


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and "src" in attrs:
            self.assets.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.assets.append(attrs["href"])


def test_production_frontend_under_ingress(tmp_path, monkeypatch):
    configured = os.environ.get("QUESTBOARD_TEST_FRONTEND_DIST")
    dist = Path(configured).resolve() if configured else ADDON / "frontend" / "dist"
    if not (dist / "index.html").is_file():
        if configured:
            pytest.fail(f"Production frontend not found at {dist}")
        pytest.skip("Build frontend/dist or set QUESTBOARD_TEST_FRONTEND_DIST to test production assets")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FRONTEND_DIST", str(dist))

    with TestClient(app, root_path=INGRESS.rstrip("/")) as client:
        page = client.get(INGRESS)
        assert page.status_code == 200
        parser = AssetParser()
        parser.feed(page.text)
        assert any(urlsplit(asset).path.endswith(".js") for asset in parser.assets)
        assert any(urlsplit(asset).path.endswith(".css") for asset in parser.assets)
        for asset in parser.assets:
            resolved = urljoin("http://testserver" + INGRESS, asset)
            assert urlsplit(resolved).path.startswith(INGRESS), asset
            response = client.get(resolved)
            assert response.status_code == 200, asset
            assert response.content == (dist / urlsplit(asset).path).read_bytes()
        assert client.get(INGRESS + "api/profiles").status_code == 200
        assert client.get(INGRESS + "api/not-a-route").status_code == 404
        assert client.get(INGRESS + "missing.js").status_code == 404
        assert client.get(INGRESS + "room").text == page.text

        js = "\n".join((dist / urlsplit(asset).path).read_text() for asset in parser.assets if urlsplit(asset).path.endswith(".js"))
        assert re.search(r"fetch\(\s*[`'\"]api/", js), "Production API requests must remain relative to ingress"


@contextmanager
def running_server(listener, data_dir, log_path):
    env = os.environ.copy()
    env["DATA_DIR"] = str(data_dir)
    env.pop("FRONTEND_DIST", None)
    with log_path.open("a") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "backend.main:app", "--fd", str(listener.fileno())],
            cwd=ADDON,
            env=env,
            pass_fds=(listener.fileno(),),
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            url = f"http://127.0.0.1:{listener.getsockname()[1]}"
            for _ in range(100):
                if process.poll() is not None:
                    pytest.fail(f"Server exited: {log_path.read_text()}")
                try:
                    if httpx.get(url + "/api/profiles", timeout=0.2).status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.05)
            else:
                pytest.fail(f"Server did not start: {log_path.read_text()}")
            yield url
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)


def test_sqlite_survives_server_restart(tmp_path):
    data = tmp_path / "data"
    log = tmp_path / "server.log"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        with running_server(listener, data, log) as url, httpx.Client(base_url=url) as client:
            updated = client.patch("/api/profiles/remy", json={"name": "Restart test", "color": "#abcdef"})
            updated.raise_for_status()
            headers = {"Idempotency-Key": "restart-test"}
            client.post("/api/profiles/remy/simulate-reward", headers=headers).raise_for_status()
            opened = client.post("/api/profiles/remy/open-chest")
            opened.raise_for_status()
            item = opened.json()["item"]
            attribute = "equipped" if item["category"] in ("outfit", "accessory") else "placed"
            client.post(f"/api/profiles/remy/items/{item['id']}", json={attribute: True}).raise_for_status()
            client.post("/api/profiles/remy/simulate-reward", headers={"Idempotency-Key": "remaining"}).raise_for_status()
            before = client.get("/api/profiles/remy").json()
            assert before["profile"]["chests"] == 1
            assert next(i for i in before["items"] if i["id"] == item["id"])[attribute]

        assert (data / "questboard.sqlite3").is_file()
        with running_server(listener, data, log) as url, httpx.Client(base_url=url) as client:
            response = client.get("/api/profiles/remy")
            response.raise_for_status()
            assert response.json() == before
            retry = client.post("/api/profiles/remy/simulate-reward", headers=headers)
            retry.raise_for_status()
            assert retry.json()["chests"] == 1
            assert client.post("/api/profiles/gigi/simulate-reward", headers=headers).status_code == 409
