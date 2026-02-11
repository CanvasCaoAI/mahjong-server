# mahjong-server

一个基于 `Express + Socket.IO` 的四人麻将房间服务器，提供房间管理、断线重连、游戏状态广播和基础对局逻辑。

## 功能概览

- 四人房间（按 `roomId` 区分），支持断线重连（按 `clientId` 识别）
- 通过 Socket.IO 实时推送状态
- 30 天离线房间保留，定时清理
- 简单健康检查接口 `GET /health`
- 支持调试模式发牌（`debug=true`）

## 技术栈

- Node.js + TypeScript
- Express 5
- Socket.IO 4

## 本地运行

```bash
npm install
npm run dev
```

默认端口为 `5174`，可通过 `PORT` 环境变量覆盖：

```bash
PORT=8080 npm run dev
```

构建与启动：

```bash
npm run build
npm run start
```

## Socket.IO 协议

连接时需要携带 `auth`：

```ts
{
  roomId: string;   // 房间号（必填）
  clientId: string; // 客户端唯一标识（必填）
  debug?: boolean;  // 可选：任意客户端开启后，房间进入调试发牌
}
```

### 服务端事件

- `state`: 推送当前对局公共状态
- `errorMsg`: 错误提示 `{ message: string }`

### 客户端事件（发给服务端）

- `setName` `{ name?: string }` 设置昵称
- `ready` 准备开始
- `draw` 摸牌
- `discard` `{ index: number }` 打出手牌索引
- `hu` 胡牌
- `peng` 碰牌
- `chi` 吃牌
- `passClaim` 放弃吃/碰/胡

兼容事件：

- `checkWin` 等同于 `hu`

### `state` 数据结构（核心字段）

```ts
{
  connected: boolean;
  players: Array<{ seat: 0|1|2|3; name: string; ready: boolean } | null>;
  started: boolean;
  wallCount: number;
  discards: Array<{ seat: 0|1|2|3; tile: string }>;
  turn: 0|1|2|3;
  phase: "draw" | "discard" | "claim" | "end";
  yourSeat: 0|1|2|3 | null;
  yourHand: string[];
  yourMelds: Array<{ type: "peng" | "chi"; tiles: string[]; fromSeat: 0|1|2|3 }>;
  meldsBySeat: Array<Array<{ type: "peng" | "chi"; tiles: string[]; fromSeat: 0|1|2|3 }>>;
  handCounts: number[]; // 0-3
  winAvailable: boolean;
  pengAvailable: boolean;
  chiAvailable: boolean;
  message: string;
  result?: {
    winners: Array<0|1|2|3>;
    handsBySeat: Partial<Record<0|1|2|3, string[]>>;
    reason: string;
  };
}
```

> 说明：`tile` 采用字符串编码，具体编码规则见服务端 `Tile` 领域定义。

## 目录结构

- `src/index.ts` 入口（HTTP + Socket.IO）
- `src/rooms/` 房间管理
- `src/game/` 对局逻辑
- `src/domain/` 牌墙、胡牌判断等核心领域
- `src/net/` DTO 与对外状态

