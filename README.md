# Dialog-Export

Dialog-Export 是一个本地浏览器扩展，用来把网页端 AI 对话导出为本地 Markdown 文件。

它兼容 Chrome 和 Microsoft Edge，基于 Manifest V3、TypeScript 和 Vite 构建。

## 功能

- 导出当前对话为 `.md` 文件
- 扫描历史会话
- 勾选要导出的历史会话
- 批量顺序导出选中的对话
- 每个对话单独保存为 Markdown 文件
- 批量导出完成后生成 `index.md`
- 有失败项时生成 `failed.md`
- 支持停止导出

## 支持的平台

- ChatGPT
- Claude
- Gemini
- Grok
- DeepSeek
- Kimi
- 豆包 Doubao
- Qwen / 通义千问
- 腾讯元宝 Yuanbao

Google AI Studio 当前不支持。

## 隐私说明

Dialog-Export 只在浏览器本地运行。

- 不上传聊天内容
- 不使用后端服务
- 不读取 cookie
- 不读取 token
- 不读取 localStorage
- 不读取 IndexedDB
- 不调用 AI 平台内部接口
- 不使用 webRequest
- 不申请 history 权限
- 不申请 cookies 权限
- 不申请 `<all_urls>`
- 不自动发送消息
- 不修改用户对话内容

扩展只读取当前网页 DOM 中用户自己可见的对话内容，并通过浏览器下载能力保存为本地 Markdown 文件。

## 权限说明

扩展使用的权限：

- `tabs`：识别当前标签页，并在批量导出时顺序打开选中的会话链接
- `scripting`：在受支持的 AI 网页中注入 content script
- `downloads`：下载 Markdown 文件
- `storage`：保存 popup 的临时状态、扫描结果和勾选状态

扩展只申请受支持平台的域名权限，不申请 `<all_urls>`。

## 本地开发

安装依赖：

```bash
npm install
```

生成图标：

```bash
npm run icons
```

构建扩展：

```bash
npm run build
```

发布前检查：

```bash
npm run check:release
```

## 浏览器加载

构建完成后，在 Chrome 或 Edge 的扩展开发者模式中加载：

```text
D:\VibeCoding\gpt-dialog\dist
```

不要加载项目根目录。

每次修改代码后：

1. 运行 `npm run build`
2. 打开 `chrome://extensions` 或 `edge://extensions`
3. 找到 Dialog-Export
4. 点击重新加载
5. 刷新目标 AI 网页后再测试

## 已知限制

网页端 AI 产品经常更新 DOM 结构。如果某个平台突然扫描不到历史会话，通常是页面结构变化导致，需要更新对应平台适配器。

当前版本不支持 ZIP 打包、云同步、后端备份或跨设备同步。
