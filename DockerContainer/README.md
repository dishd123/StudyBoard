# DockerContainer: build and deploy the StudyBoard container

This folder holds everything needed to package the StudyBoard site as one Docker image with Apache httpd, and to run it on an Amazon EC2 server. The wiki page Docker Creation shows every step with screenshots.

This is the retained Project 1 static frontend container, not the Project 2
Cloud Run deployment. Issue #15 updates its build stage to read `frontend/`;
the Docker build context remains the repository root. Project 2's Express API
and source-based Cloud Run deployment are tracked separately.

| File | What it is |
| --- | --- |
| `Dockerfile` | Two stages. Stage 1 (`node:22-alpine`) installs `frontend/` dependencies with `npm ci` and builds into `/build/dist/`. Stage 2 (`httpd:2.4-alpine`) adds our `httpd.conf` and copies that static output into Apache's web folder. |
| `httpd.conf` | Apache configuration: port 80, the modules the site needs, `DocumentRoot`, `index.html` for folders, no folder listings, `/app` and `/login` redirected to `/app/` and `/login/`, and logs sent to `docker logs`. |
| `README.md` | This file. |

## Architecture

Build and run on the same CPU architecture. On a Mac with an Apple chip, Docker builds `linux/arm64` images, which run natively on Graviton instances such as t4g.small. That is the setup used here. For an x86 instance such as t3.micro, add `--platform linux/amd64` to `docker build`.

## 1. Build and test on the laptop

Run these from the repository root, not from this folder:

```
docker build -f DockerContainer/Dockerfile -t project1-part2:1.0 .
docker image inspect project1-part2:1.0 --format "{{.Os}}/{{.Architecture}}"
docker run -d --name project1-local -p 8080:80 project1-part2:1.0
```

Open `http://localhost:8080` and check all five pages. Then remove the test container:

```
docker rm -f project1-local
```

## 2. Push to Amazon ECR

Needs the AWS CLI with the Learner Lab credentials from AWS Details in `~/.aws/credentials`. Create the repository once:

```
aws ecr create-repository --repository-name project1-part2 --region us-east-1 --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true
```

Log in, tag and push:

```
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 098209006210.dkr.ecr.us-east-1.amazonaws.com
docker tag project1-part2:1.0 098209006210.dkr.ecr.us-east-1.amazonaws.com/project1-part2:1.0
docker push 098209006210.dkr.ecr.us-east-1.amazonaws.com/project1-part2:1.0
```

Tags are immutable: ECR refuses to overwrite a tag, so every new build gets the next tag (1.1, 1.2, ...).

## 3. Launch the server

EC2 in us-east-1 with these settings:

- AMI: Amazon Linux 2023, 64-bit (Arm).
- Instance type: t4g.small.
- Key pair: your key pair. The user is `ec2-user`.
- Security group: inbound TCP 22 (SSH) from your IP, and TCP 80 (HTTP) from anywhere.
- Storage: the default 8 GiB gp3.
- Advanced details, User data:

```bash
#!/bin/bash
set -euxo pipefail

dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
```

The script installs Docker on the first boot, starts it at every boot, and lets `ec2-user` run `docker` without `sudo`.

## 4. Deploy on the server

Connect:

```
ssh -i ~/.ssh/<key>.pem ec2-user@<server address>
```

The server needs AWS credentials to log in to ECR: either attach the Learner Lab's `LabInstanceProfile` as the IAM instance profile, or put the current session credentials in `~/.aws/credentials` on the server (they are temporary and expire, so copy fresh ones from AWS Details before each pull). Then:

```
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 098209006210.dkr.ecr.us-east-1.amazonaws.com
docker pull 098209006210.dkr.ecr.us-east-1.amazonaws.com/project1-part2:1.0
docker run -d --name project1 --restart unless-stopped -p 80:80 098209006210.dkr.ecr.us-east-1.amazonaws.com/project1-part2:1.0
docker ps
curl -I http://localhost
```

`curl` must print `HTTP/1.1 200 OK` and `Server: Apache/2.4.69 (Unix)` or similar. `--restart unless-stopped` brings the container back after every reboot or stop and start. The site is then at `http://<server address>/`; in this project, `http://studyboard.tech/` through the Elastic IP `23.21.105.57`.

## 5. Update the site

On the laptop, build, tag and push the next tag, for example `1.1`, as in steps 1 and 2. On the server:

```
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 098209006210.dkr.ecr.us-east-1.amazonaws.com
docker pull 098209006210.dkr.ecr.us-east-1.amazonaws.com/project1-part2:1.1
docker rm -f project1
docker run -d --name project1 --restart unless-stopped -p 80:80 098209006210.dkr.ecr.us-east-1.amazonaws.com/project1-part2:1.1
```

## Logs

```
docker logs --tail 20 project1
```

`httpd.conf` names the `combined` log format without defining it, so each request currently logs the word `combined`. To get full log lines, add this line above `CustomLog` in `httpd.conf` and rebuild with a new tag:

```
LogFormat "%h %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-Agent}i\"" combined
```

AI use: Claude (Anthropic), ChatGPT (OpenAI) and GitHub Copilot helped with the commands and with drafting and editing these instructions. I, Disha Deshmukh, ran every step on our server.
