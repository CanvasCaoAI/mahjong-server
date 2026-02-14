# EC2 部署/启动（Server）

目标：在 AWS EC2 上手动部署，进程**崩了自动重启**。

---

## 0) 前置条件

- EC2 上已安装 Node.js（建议 20+）
- 安装 git
- 安全组放行端口：
  - TCP `5174`（后端）

---

## 1) 手动启动（不守护，不推荐长期）

```bash
cd ~/mahjong-server
npm ci
npm run dev
```

后端监听：
- `http://<EC2 公网 IP>:5174`
- 健康检查：`http://<EC2 公网 IP>:5174/health`

> 备注：线上更建议做成 `build + node dist/...` 的生产启动方式；当前文档先按现有脚本运行。

---

## 2) systemd 守护（推荐：崩了自动重启 + 开机自启）

### 2.1 创建 service 文件

```bash
sudo tee /etc/systemd/system/mahjong-server.service > /dev/null <<'EOF'
[Unit]
Description=mahjong-server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/mahjong-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/env npm run dev
Restart=always
RestartSec=2

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

把 `User=ubuntu` / `WorkingDirectory=` 改成你实际的用户名和路径。

### 2.2 启用/启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable mahjong-server
sudo systemctl restart mahjong-server
sudo systemctl status mahjong-server --no-pager
```

### 2.3 查看日志

```bash
journalctl -u mahjong-server -f
```

---

## 3) 更新代码（手动部署流程）

```bash
cd ~/mahjong-server
git pull
npm ci
sudo systemctl restart mahjong-server
```
