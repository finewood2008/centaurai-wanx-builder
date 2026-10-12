"""Isolated native WANX HTTP server with a synthetic LLM, only for desktop tests."""
import asyncio
import json
import logging
import socket
import sys
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))

import uvicorn
from tests.support.app import octop_client
from tests.support.auth import bootstrap_admin, auth_header, seed_openai_provider
from tests.integration.test_applications import grant_product


async def main():
    home = Path(sys.argv[1])
    home.mkdir(parents=True, exist_ok=True)
    patch("pathlib.Path.home", return_value=home).start()
    from octop.infra.proactive.scheduler import ProactiveCareScheduler
    patch.object(ProactiveCareScheduler,"ensure_scheduled",lambda self,_id:None).start()
    if "--real-tools" in sys.argv:
        from octop_harness.llm.factory import ChatModelFactory
        from composition_model import CompositionModel
        patch.object(ChatModelFactory, "get_chat_model", lambda *a,**kw: CompositionModel()).start()
    async with octop_client(home, patch_llm="--real-tools" not in sys.argv) as (client, server):
        if "--portable-backport" in sys.argv:
            # Mirror the reviewed additive migration in an empty, isolated fixture only.
            import sqlite3
            sql = Path(__file__).resolve().parents[1] / 'docs/application-center-update/additive.sql'
            with sqlite3.connect(home / 'octop.db') as db:
                db.executescript(sql.read_text())
        await bootstrap_admin(client, home)
        admin = await auth_header(client)
        await seed_openai_provider(client, admin)
        response = await client.post('/api/admin/applications', headers=admin, json={
            'application_id': 'wanx-builder', 'name': 'Builder test fixture',
            'capabilities': ['builder','chat','memory','workspace','skills','connectors','knowledge','teams','upload','voice','model_settings'],
            'agent_template': {'default_model':'openai/gpt-4o'},
            'resource_requirements': {'default_model':{'kind':'model'}}})
        assert response.status_code == 201, response.text
        await grant_product(client, server, admin, 'admin', 'wanx-builder')
        sock=socket.socket();sock.bind(('127.0.0.1',0))
        (home/'ready.json').write_text(json.dumps({'port':sock.getsockname()[1]}))
        instance=uvicorn.Server(uvicorn.Config(client._octop_app,log_level='error',access_log=False))
        await instance.serve(sockets=[sock])

logging.basicConfig(level=logging.ERROR)
asyncio.run(main())
