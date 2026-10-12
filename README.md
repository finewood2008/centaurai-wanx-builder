# 万象 Builder

构建在 WANX 上的桌面应用构建器。用户先选择由已有专家组成的标准应用，再通过 Builder 对话修改它的内容、功能和任务 UI。应用中心统一管理定义、草稿、不可变版本、试用记录和私人用户实例。

当前版本为 **0.5.0 开发快照**，首版面向个人使用的 Apple Silicon Mac。

## 标准应用库

2026-10-12 盘点 27 个内置专家和 55 个市场专家，共 82 个目录条目，按任务分为八类：内容创作、观察与分析、检查与运维、学习与训练、办公与文档、方案与决策、生活与服务、编程与工程。

专家的原始方法和任务入口保留来源，用户登录后重新读取所连接盒子的真实目录与依赖状态。完整分类见 [专家应用清单](docs/expert-app-inventory.md)，设计与运行方式见 [标准应用设计](docs/standard-apps.md)。目录覆盖不等于全部专家业务已验收。

生成应用通过任务按钮、表单、文件、编辑器、表格、图表、方案卡片或检查清单执行。交流、执行记录和原生确认按需展开。Builder 的对话修改同一个构建物的内容、任务、能力绑定和组件布局。

## 能力边界

- 复用 WANX 已有专家、原生工具、连接器和技能；代码负责配置、组合、展示、验证和交付。
- Ask 只读讨论与目录查询；Plan 保存计划；Craft 才修改配置、安装依赖、试用和构建。切换模式不扩大权限。
- 新增技能仅保存说明型 `SKILL.md`。既有技能包的程序仍由 WANX 原生流程管理，禁止生成新的执行脚本、工具或连接器。
- UI 组合现有模板与组件，不执行任意 HTML、JavaScript 或自定义业务后端。
- 凭据由 WANX 管理，不进入定义或安装包。依赖未知、缺少授权或试用失败时保留草稿，不能标记为已验证。
- Builder 不提供记忆、知识库和个性化管理板块。生成应用与 Builder 使用独立应用身份，生成应用运行时不要求 Builder 打开。

## 开发

需要 Node.js 22+。桌面打包需要 Apple Silicon Mac。

```sh
npm ci
npm --prefix ui ci
npm test
npm --prefix ui test -- src/builder
npm run build
npm start
```

构建使用仓库内固定的 `vendor/centaurai-wanx-0.1.0-wanx.2.tgz`。SDK 来源为 [WANX SDK](https://github.com/finewood2008/wanx-sdk)，局域网发现复用知君连接服务；发现盒子不使用 SDK 设备目录。连接后的业务请求通过标准 SDK 和应用自身的身份调用目标 WANX。

```sh
WANX_BUILDER_RELEASE_DIR="$HOME/Applications/WANX-Builder" npm run package:mac
```

同版本安装包不会覆盖已有文件。当前打包使用本机 ad-hoc 签名，未公证；仓库未附带个人安装包或用户运行数据。生产账号和本机配置应保存在忽略的 `deployment.json` 中，可参考 [配置示例](deployment.example.json)。

服务端须已支持 Builder v2、应用中心生命周期协议及私人实例。增量接入参考见 [服务端补丁](server-patches/README.md)。不要把补丁直接套用到不匹配的服务版本。

## 验证状态

已进行目录与定义校验、模式约束、界面组件、私人实例和原生技能边界的相关检查。隔离环境使用确定性测试模型及原生 WANX 工具，已验证 Builder 对同一应用的内容、功能和 UI 修改，以及一个版本的试用、打包与发布。

完整双版本流程、独立安装后的更新验证和真实模型／业务连接器验收仍在继续。此开发快照不代表 82 个专家的业务功能全部可交付，也不以测试模型输出替代业务验收。每次交付仍须核验该应用的实际依赖和执行记录。

## 仓库结构

- `core/`：应用定义、专家目录、标准应用、构建提示与固定打包流程。
- `ui/`：应用库、Builder 对话工作台和任务界面组件。
- `shell/`：Electron 宿主、知君连接服务接入及应用身份请求转发。
- `tests/`：定义、连接、界面及隔离环境的验证代码。
- `docs/`：产品设计与专家分类。
- `server-patches/`：WANX 增量接入参考。

本机部署记录、服务副本、测试截图、账号会话、运行数据库和日志不进入公开仓库。

## 许可

公开仓库不自动改变自有代码的现有许可，见 [LICENSE](LICENSE)。复用的 Octop/WANX Dashboard 代码及其他第三方组件保留各自许可，见 [第三方声明](THIRD_PARTY_NOTICES.md) 与 [Octop 许可](third-party/Octop-LICENSE)。
