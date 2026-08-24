# WhatsApp RDP Gateway — Local Test

This package starts an Apache Guacamole 1.6.0 browser-based RDP gateway using
Docker Compose. It is intended for the first local Windows test of the WhatsApp
dashboard project.

## Security defaults

- Guacamole is published only on `127.0.0.1:8085`.
- PostgreSQL and `guacd` are not published to the host or internet.
- The database password is generated locally with a cryptographic RNG.
- The database password is mounted into containers as a Docker secret.
- Container versions are pinned.
- PostgreSQL data persists in the `wa_guacamole_postgres_data` Docker volume.

Do not expose Windows port 3389, PostgreSQL, or guacd to the public internet.

## Install

1. Extract this folder to:

   `E:\Programs\wa-client-hub\guacamole`

2. Open PowerShell as Administrator.

3. Run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass -Force
   cd "E:\Programs\wa-client-hub\guacamole"
   .\Enable-RDP-Audio.ps1
   .\Setup-Guacamole.ps1
   ```

4. Open `http://127.0.0.1:8085/`.

5. Initial Guacamole login:

   - Username: `guacadmin`
   - Password: `guacadmin`

6. Change the default Guacamole password immediately.

## Create the RDP connection

Open Guacamole settings and create a new RDP connection:

| Field | Value |
|---|---|
| Name | WhatsApp Client 01 |
| Protocol | RDP |
| Hostname | `host.docker.internal` |
| Port | `3389` |
| Username | `wa-client-01` |
| Password | The private Windows password created for this user |
| Security mode | NLA |
| Ignore server certificate | Enabled |
| Enable audio input | Enabled |
| Disable audio | Disabled |
| Resize method | Display update |

Do not send or store the Windows password in chat, source code, or screenshots.

When the RDP desktop opens, sign into Windows, open Chrome or Edge, visit
`https://web.whatsapp.com`, allow microphone access, and link the test WhatsApp
account.

## Daily use

Start:

```powershell
.\Start-Guacamole.ps1
```

Stop without deleting data:

```powershell
.\Stop-Guacamole.ps1
```

Diagnostics:

```powershell
.\Diagnose-Guacamole.ps1
```

## Important limitations

- Windows Pro supports only one interactive RDP session at a time.
- This local setup is suitable for one-account functional testing.
- A commercial multi-client version needs isolated Windows VM capacity per
  concurrently active client, or properly licensed Windows Server RDS/AVD
  infrastructure.
- RDP microphone forwarding supports voice-call testing when browser and
  Windows permissions allow it. Webcam/video-call forwarding is not guaranteed
  by this Guacamole RDP setup.
- Public access through `wa.mentoringhub.online`, dashboard single sign-on, and
  tenant isolation are separate implementation phases.

## Backup

The important persistent data is inside the Docker volume:

`wa_guacamole_postgres_data`

Before upgrades, export the PostgreSQL database and keep a protected copy of the
`secrets` directory. Never commit the secrets directory to Git.
