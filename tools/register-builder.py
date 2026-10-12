"""Offline registration through WANX's existing local CLI/domain permission rules.

Stop the selected WANX service first. No credentials or user roles are changed.
Requires --apply; WANX's offline CLI may also run its existing database migrations.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import site
import socket
from pathlib import Path


def require_stopped(port: int) -> None:
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            raise SystemExit("Stop the WANX service before using its offline CLI database.")


async def register(args: argparse.Namespace) -> None:
    if not args.apply:
        raise SystemExit("Registration requires --apply after the maintenance window is approved.")
    require_stopped(args.port)
    if not (args.home / "octop.db").is_file():
        raise SystemExit("The existing WANX database was not found; refusing to initialize one.")
    site.addsitedir(str(args.packages))
    from octop.cli.support.db import open_cli_services
    from octop.infra.applications.models import DeploymentBody, ProductDefinition
    from octop.infra.applications.service import ApplicationService
    from octop.infra.users.manager import UserManager
    from octop.infra.users.permissions import user_has_permission

    manifest = Path(__file__).resolve().parents[1] / "docs/builder-manifest.json"
    definition = ProductDefinition.model_validate_json(manifest.read_text())
    with open_cli_services(args.home) as services:
        users = UserManager(services)
        await users.boot()
        admin = users.get(args.admin_user)
        recipient = users.get(args.grant_user)
        if admin is None or not user_has_permission(admin, "applications_manage"):
            raise SystemExit("The selected existing account lacks native application management rights.")
        if recipient is None:
            raise SystemExit("The recipient must be an existing, enabled WANX account.")
        apps = ApplicationService(services)
        existing = services.application_repo.get(definition.application_id)
        if existing is not None:
            current = apps.get(admin, definition.application_id)
            current_definition = ProductDefinition.model_validate(
                current.model_dump(include=set(ProductDefinition.model_fields))
            )
            if current_definition != definition:
                raise SystemExit("An existing Builder definition differs; refusing to overwrite it.")
        summary = {
            "application_id": definition.application_id,
            "acting_user": admin.username,
            "grant_user": recipient.username,
            "create": existing is None,
            "account_roles_changed": False,
            "apply": args.apply,
        }
        require_stopped(args.port)
        if existing is None:
            apps.create(admin, definition)
        apps.put_deployment(admin, definition.application_id, DeploymentBody(enabled=True))
        apps.put_access(admin, definition.application_id, recipient.id, True)
        print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True, type=Path)
    parser.add_argument("--packages", required=True, type=Path)
    parser.add_argument("--admin-user", required=True)
    parser.add_argument("--grant-user", required=True)
    parser.add_argument("--port", type=int, default=8088)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(register(parser.parse_args()))
