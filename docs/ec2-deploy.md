# EC2 部署/启动（Server）

目标：在 AWS EC2 上手动部署，进程**崩了自动重启**。

---

## 0) 前置条件

- EC2 上已安装 Node.js（建议 20+）
- 安装 git
- 安全组放行端口：
  - TCP `5174`（后端）

---

## 1) 构建并启动（推荐：生产方式）

```bash
cd ~/mahjong-server
npm ci
npm run build
npm run start
```

后端监听：
- `http://<EC2 公网 IP>:5174`
- 健康检查：`http://<EC2 公网 IP>:5174/health`

---

## 2) pm2 守护（推荐：崩了自动重启 + 开机自启）

### 2.1 安装 pm2

```bash
sudo npm i -g pm2
pm2 -v
```

### 2.2 启动后端（跑编译后的 dist）

```bash
cd ~/mahjong-server
npm ci
npm run build

pm2 start dist/index.js --name mahjong-server --time
pm2 save
```

### 2.3 设置开机自启

```bash
pm2 startup
# 按提示复制粘贴它输出的 sudo 命令
pm2 save
```

### 2.4 常用命令

```bash
pm2 status
pm2 logs mahjong-server
pm2 restart mahjong-server
pm2 stop mahjong-server
pm2 delete mahjong-server
```

---

## 3) 更新代码（手动部署流程）

```bash
cd ~/mahjong-server
git pull
npm ci
npm run build
pm2 restart mahjong-server
```

> 说明：我们让 pm2 直接运行 `dist/index.js`，比 `tsx watch` 更轻更稳。
