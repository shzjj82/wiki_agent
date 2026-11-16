# 页面分享：边界与 NestJS 任务

## 边界

编辑器是客户端。桌面端和部署出去的网页都只发请求、画页面，不保存分享，也不判断链接是否失效。

- A 在桌面客户端（或已经打开的编辑器网页）里分享。客户端只提交 `pageId`、有效期、是否允许再分享。
- B 一定用浏览器打开已部署网页上的 `/s/:token`。这个页面向 NestJS 取快照再渲染。B 不安装客户端。
- 分享的正文、有效期、再分享、撤销都在 NestJS。编辑器把 `/wiki/*` 代理到网关，路径与下面的接口一致。
- 桌面端本机地址（`127.0.0.1`）不能当作分享链接。客户端用 `VITE_EDITOR_PUBLIC_ORIGIN` 拼出部署网页的地址。

不要在 `apps/editor/server` 里再实现一套分享存储。不要把分享写进 `apps/server`（那是博客转发，业务码是 `blog`）。

## 接口

统一信封：成功 `{ success: true, data }`，失败 `{ success: false, code, message }`。公开接口 `Cache-Control: no-store`。需要登录的接口走现有 wiki JWT 守卫，身份用账号 `accountId`，不要用请求体里的用户 id，也不要把 JWT 存进分享记录。业务码 `wiki`。

### POST `/wiki/shares`

登录。body：

```json
{ "pageId": "页面 id", "expiresIn": 604800, "allowReshare": false }
```

- `expiresIn` 省略或 `null`：不过期。
- 否则必须是整数秒，最短 60，最长 366 天。
- `allowReshare` 只有 `true` 才允许再分享。

用调用者的登录态读 `GET /wiki/documents/id/:pageId`。读不到就不要创建（无权限或页面不存在，`PAGE_UNREADABLE`）。只保存当时的标题和正文。正文过大返回 `SHARE_TOO_LARGE`（建议上限约 2MB）。

`data`：`{ token, urlPath, pageId, title, expiresAt, allowReshare }`。`urlPath` 为 `/s/` + token。`expiresAt` 为空表示不过期。

### GET `/wiki/shares?pageId=`

登录。只返回该页面上、调用者能管理、且未撤销的链接，不返回正文。能管理指：创建者，或文档作者。不知道页面 id 的人不能靠枚举看到别人的 token。

`data.shares[]`：`{ token, pageId, title, createdAt, expiresAt, allowReshare, parentToken }`。

### DELETE `/wiki/shares/:token`

登录。创建者或文档作者写入撤销时间。其他人返回 `SHARE_UNAVAILABLE`。父链接撤销后，子链接读取时一并失效，不必逐条改子记录。

`data`：`{ revoked: true }`。

### GET `/wiki/shares/view/:token`

不登录。链接就是凭证。

沿 `parentToken` 向上检查，建议最多 16 层。自己或任一祖先不存在、已撤销、已过期，都返回 404，`code` 为 `SHARE_UNAVAILABLE`。不要用不同状态码区分这三种情况。

`data`：`{ title, body, expiresAt, allowReshare, sharedAt }`。不要返回 `pageId`。

### POST `/wiki/shares/view/:token/reshare`

不登录。父链接必须仍然有效，且 `allowReshare` 为 true，否则父链接失效时返回 `SHARE_UNAVAILABLE`，不允许再分享时返回 403 `SHARE_RESHARE_DENIED`。

body 与创建相同，但没有 `pageId`：`{ expiresIn, allowReshare }`。

子记录复制父记录的页面 id、标题、正文、创建者账号和文档作者。`createdBy` 为空。子链接到期时间不能晚于父链接：没填就继承父链接；填了更长就收成父链接的到期时间。父链接不过期时，子链接可以自己选择。子链接只有在父链接允许、且本次也传 `true` 时才能再分享。

`data`：`{ token, urlPath, title, expiresAt, allowReshare }`。不要返回 `pageId`。

## 数据

建议一条分享记录包含：

| 字段 | 含义 |
| --- | --- |
| token | 不可猜测的随机串 |
| pageId | 来源页面，公开接口不返回 |
| title / body | 创建时的快照，之后原文修改不回写 |
| ownerAccountId | 发出根链接的人 |
| pageOwnerAccountId | 文档作者，可以撤销 |
| createdBy | 原始创建者；匿名再分享为空 |
| createdAt / expiresAt | 创建时间；到期时间为空表示不过期 |
| allowReshare | 是否允许再分享 |
| parentToken | 再分享指向父链接；根链接为空 |
| revokedAt | 撤销时间 |

## NestJS 任务

- [ ] 在 wiki 模块增加分享实体和上面的五条路由，挂到现有 `/wiki` 鉴权下。公开的 view、reshare 单独放行。
- [ ] 创建时用调用者权限读取文档并写入快照，拒绝前端直接上传正文。
- [ ] 校验 `expiresIn`：空为不过期，否则 60 秒到 366 天的整数秒。
- [ ] 列表只返回调用者能管理且未撤销的记录，不带正文。
- [ ] 撤销只允许创建者或文档作者，并让整条子链在读取时失效。
- [ ] 公开读取做父链检查，失败统一 `SHARE_UNAVAILABLE`。
- [ ] 再分享复制快照，收紧到期时间和 `allowReshare`，公开响应不带 `pageId`。
- [ ] 不落盘 JWT。快照大小设上限。
- [ ] 为创建、过期、再分享越权、撤销父链、公开错误码不区分原因补测试。

编辑器侧已经接好这些路径：对话框调用创建、列表、撤销；`/s/:token` 调用公开读取和再分享。NestJS 未实现前，这些请求会由网关返回失败。
