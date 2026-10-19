<h1 align="center">
  <img src="https://cdn.ouonnki.com/gh/Ouonnki/blog-pictures/posts/logo.svg" alt="OuonnkiTV Logo" width="80"/><br/>
  OuonnkiTV
</h1>

<p align="center">
  现代化视频聚合搜索与播放前端
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"/></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js >=20"/>
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9.15.4-blue" alt="pnpm >=9.15.4"/>
  <img src="https://img.shields.io/badge/vite-%5E6.3.5-yellowgreen" alt="Vite"/>
  <a href="https://github.com/Ouonnki/OuonnkiTV/stargazers"><img src="https://img.shields.io/github/stars/Ouonnki/OuonnkiTV?style=social" alt="GitHub stars"/></a>
</p>

---

## ✨ 特性

聚合搜索 · 流畅播放· TMDB 智能匹配 · 收藏管理 · 视频源订阅 · 观看历史 · 响应式设计 · 高性能· 多端适配· 出色的UI/UX

### 追剧更新

- 在收藏卡片点击「开启追更」，首页「追剧更新」会集中显示更新集数、待看集数和继续观看入口。
- 没有开启追更时首页自动隐藏该区域，收藏页提供开启引导；海报和剧名始终可点击，即使检查失败也能进入 TMDB 详情或 CMS 播放页。
- TMDB 剧集从实际季列表选择追更季，显示季名称并排除特别篇，默认沿用最近观看的有效季；CMS 收藏直接检查原视频源。季信息按需加载并缓存，加载失败可重试，已开启的追更保留原选择。
- 打开网站时自动检查，30 分钟内复用同配置的成功结果，也可点击「检查更新」立即刷新。
- 首次成功检查建立新集基准，已有剧集只计入待看；之后同一季、同一资源出现新集时显示「新增 N 集」，首页优先展示。提醒可以标记已读，待看进度保留。新集提醒与已读状态仅保存在当前设备，换源、切季或重新开启追更时重新建立基准。
- 集数来自视频源详情中的正片播放地址，不使用 TMDB 的计划播出集数；检查失败会保留上次成功结果。
- 首页与收藏卡片支持「绑定追更源」：选择启用的视频源，搜索并核对资源标题、年份及可用集数后确认绑定。绑定按季随收藏同步，不包含源地址或凭据；固定资源失效时可重新绑定或恢复默认选源。换源会保存当前已看集数、重新建立新集基准。
- 待看集数按连续观看进度估算，当前集看完至少 90% 才算完成。关闭观看记录或清除历史后，估算可能不完整。
- 首页追更卡片与收藏卡片支持「校准进度」：填写已看完的最后一集，或标记已追平，0 表示从头开始。校准按季保存并随收藏云同步，覆盖旧观看记录的推算，后续播放仍会自动推进；可恢复自动计算。
- 追更开关和季数随收藏云同步；检查结果仅缓存在当前设备，网站关闭期间不发送通知。

## 🚀 快速开始

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ouonnki/OuonnkiTV&build-command=pnpm%20build&install-command=pnpm%20install&output-directory=dist)

> Docker、Cloudflare Pages、Netlify、本地开发等完整部署指南 → [docs/deployment.md](docs/deployment.md)

## 📖 文档

跨设备云同步（Vercel + Supabase）：[配置指南](docs/cloud-sync.md)

| 文档 | 说明 |
| ---- | ---- |
| [部署指南](docs/deployment.md) | Docker / Vercel / Cloudflare / Netlify / 本地开发 / 更新同步 |
| [配置管理](docs/configuration.md) | 环境变量、TMDB 配置、完整配置导入 |
| [TMDB Key 申请](docs/tmdb-key.md) | TMDB API Token 注册与获取教程 |
| [视频源导入](docs/video-sources.md) | 导入方式、JSON 格式说明 |
| [开发者指南](docs/development.md) | 技术栈、项目结构、代理架构、@ouonnki/cms-core |

---

## 📜 贡献与许可

欢迎通过 [Issue](https://github.com/Ouonnki/OuonnkiTV/issues) 或 [Pull Request](https://github.com/Ouonnki/OuonnkiTV/pulls) 参与贡献。本项目采用 [Apache License 2.0](LICENSE) 开源协议。

## ⚠️ 免责声明

本项目（以下简称「本项目」）是一个开源的视频搜索聚合前端源代码，仅提供视频搜索结果的展示与播放功能的代码实现。本项目不提供任何可直接使用的成品软件、在线服务或托管平台，使用者需自行获取源代码并完成部署。

**本项目不提供、不托管、不上传、不存储、不分发、不缓存任何视频、音频、图片或其他受版权保护的内容。** 本项目源代码中不包含任何视频源地址或内容数据，所有搜索结果和播放内容均来自使用者自行配置的第三方视频源 API，本项目开发者不对这些第三方服务的合法性、可用性、安全性或内容质量承担任何责任。

使用者在部署和使用本项目源代码时，应当：
- 确保遵守所在国家或地区的法律法规
- 自行承担部署、配置和使用第三方视频源的全部法律责任
- 尊重内容创作者的知识产权和著作权
- 不将本项目源代码用于任何违法、侵权或商业侵权用途
- 对自行部署的实例及其产生的一切行为和后果承担全部责任

如发现侵权内容，请直接联系原始内容提供方（第三方视频源运营者）处理。本项目开发者仅提供源代码，无法也无义务对使用者部署的实例或第三方内容进行审查、监控、删除或管控。

**本项目源代码按「现状」（AS IS）提供，不附带任何明示或暗示的保证，包括但不限于对适销性、特定用途适用性和非侵权性的保证。** 开发者不对因部署、使用或无法使用本项目源代码而导致的任何直接、间接、附带、特殊或后果性损害承担责任，包括但不限于数据丢失、业务中断、利润损失、法律纠纷或其他商业损害。

本项目开发者保留随时修改、暂停或终止本项目的权利，且无需事先通知。

使用者获取、部署或以任何方式使用本项目源代码即表示已阅读、理解并同意本免责声明的全部内容。如不同意，请立即停止使用并删除相关代码及部署实例。

---

<p align="center">
  <a href="https://star-history.com/#Ouonnki/OuonnkiTV&Date">
    <img src="https://api.star-history.com/svg?repos=Ouonnki/OuonnkiTV&type=Date" alt="Star History Chart" />
  </a>
</p>

<p align="center">
  如果本项目对你有帮助，欢迎 ⭐ Star 支持！
</p>
