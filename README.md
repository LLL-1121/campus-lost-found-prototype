# 校园失物招领交互原型

面向校园学生的高保真交互原型，覆盖首页、发布、搜索、详情、发布成功和我的发布页面。

## 运行

直接双击 `index.html`，或在本目录运行：

```powershell
python -m http.server 8080
```

浏览器访问 `http://localhost:8080`。

## 可演示流程

- 首页浏览 → 点击信息 → 查看详情 → 联系发布者
- 首页快捷发布 → 填写信息 → 确认发布 → 发布成功
- 搜索页输入关键词 → 查看结果 → 查看详情
- 我的发布 → 查看自己发布的信息

本原型仅使用 HTML、CSS 与 JavaScript，无第三方依赖，也不收集或发送真实联系方式。

新增信息与联系方式仅保留在本次页面会话；刷新会恢复示例数据。请使用虚构联系方式演示。本人信息详情可切换“已找到 / 已归还”和未完成状态，示例他人信息没有管理按钮。当前没有后端、持久化或真实登录权限。

## 本轮测试与报告

- [完整项目报告](项目报告.md)：真实 AI 协作记录、问题修复、11 项回归、截图与 PSP 记录边界。
- [自动化结果](tests/results.json)：Microsoft Edge 浏览器测试全部通过。
- 测试脚本 `tests/regression.cjs` 使用 Node.js、Playwright 与已安装的 Edge，执行 `node tests/regression.cjs`。可用 `npm install --no-save --package-lock=false playwright` 安装开发测试工具；生产页面仍无需依赖。

![首页截图](images/home.png)

## 协作空间

当前由林彦羽（052404129）独立完成，尚无实际参与的第二名开发者。仓库已预留后续协作流程，任务、分支和自查记录不代表已经完成双人结对。

- [在线原型](https://lll-1121.github.io/campus-lost-found-prototype/)
- [待认领任务](https://github.com/LLL-1121/campus-lost-found-prototype/issues)
- [贡献与协作说明](CONTRIBUTING.md)

公开仓库允许其他同学 fork 后修改并提交 Pull Request；直接推送需要维护者邀请真实协作者。新增协作者后再按实际工作补充分工、审查和耗时记录。
