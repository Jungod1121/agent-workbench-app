# Agent Workbench · 同步后端（Cloudflare Worker）

个人用的极简同步中枢：一个 Worker + 一个 KV 命名空间，免费额度对三台设备的个人使用完全够用。

## 部署步骤

需要 Node.js（用来跑 `npx wrangler`），以及一个 Cloudflare 账号（免费即可）。

```bash
cd cloudflare-worker

# 1. 登录 Cloudflare（会打开浏览器授权）
npx wrangler login

# 2. 创建 KV 命名空间，用来存数据
npx wrangler kv namespace create WORKBENCH_KV
# 命令会输出一段类似：
#   { binding = "WORKBENCH_KV", id = "abcd1234..." }
# 把这个 id 复制，替换 wrangler.toml 里的 REPLACE_WITH_YOUR_KV_NAMESPACE_ID

# 3. 设置访问密钥（自己随便定一个足够长、随机的字符串，三端 App 里要填同一个）
npx wrangler secret put SYNC_TOKEN
# 输入你自定义的密钥，回车确认

# 4. 部署
npx wrangler deploy
```

部署成功后，终端会打印出一个形如：

```
https://agent-workbench-sync.<你的子域>.workers.dev
```

这个地址 + 第 3 步设置的密钥，就是三端桌面 App 首次启动时需要填的两项信息。

## 本地测试（可选）

```bash
npx wrangler dev
```

会在本地起一个开发服务器，可以先用 `curl` 验证一下：

```bash
curl -H "X-Sync-Token: 你的密钥" http://localhost:8787/api/state
```

## 关于安全性

- `SYNC_TOKEN` 是唯一的访问门槛，请设置得足够长（建议 32 位以上随机字符串），不要用简单密码。
- 这个 Worker 没有做多用户区分，本身设计上就是"你一个人 + 三台设备"的场景，不要把地址和密钥分享给别人。
- 如果密钥泄露，重新执行 `npx wrangler secret put SYNC_TOKEN` 换一个新的即可，旧密钥立刻失效。

## 之后想升级怎么办

- 想要真正的多设备**实时**同步（而不是"打开/切换窗口时刷新一次"），可以把 KV 换成 Durable Objects，用 WebSocket 推送——目前先用轮询/焦点刷新，个人使用完全够用，等真的觉得不够用再升级也不迟。
- 想要结构化查询、多用户，可以换成 D1（Cloudflare 的托管 SQLite），但目前这个单 JSON blob 的方案维护成本最低。
