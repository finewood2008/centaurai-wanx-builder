# 连接服务来源

`zhijun/lan-discovery.mjs` 复用同工作区 `zhijun-lan-test/server/lan-discovery.mjs`（知君 0.4.2，2026-10-10）。保留原有局域网 IPv4 校验、macOS Bonjour 查询、健康检查和无凭据发现。

随包保留发现模块的依赖及各自许可证：@leichtgewicht/ip-codec, bonjour-service, dns-packet, fast-deep-equal, multicast-dns, thunky。

`../core/lan-transport.mjs` 与 `../core/socket-path.mjs` 基于项目已安装的 centaurai-wanx HTTP transport 合约实现，修改为接收连接服务已选择的局域网 IPv4 端点。盒子发现与登录不调用 SDK 平台账号或 P2P host；连接后的业务操作继续通过标准 SDK 及原生权限处理。

## SDK 固定版本

`centaurai-wanx-0.1.0-wanx.2.tgz` 来自 CentaurAI WANX SDK，源码仓库为 https://github.com/finewood2008/wanx-sdk 。固定包 SHA-256：`0de12928e5f6631bc1f221324f449e661cf0d89c5c95c972ce3a634e830e75fe`。包内保留 SDK 许可、第三方声明和 Apple Silicon Mac 的原生宿主。

Bonjour 发现所需依赖通过根目录 package.json 安装；打包时复制实际安装的这些依赖及许可证。
