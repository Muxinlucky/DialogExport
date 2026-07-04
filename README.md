# DialogExport

DialogExport 是一个本地超轻量化浏览器扩展，用来把网页端 AI 对话导出为本地 Markdown 文件。

![](./public/volum.png)

## 最简单的安装方式

普通用户不需要克隆整个项目，推荐下载已经构建好的压缩包：**直接去realease下载也行**

```powershell
Invoke-WebRequest -Uri "https://github.com/Muxinlucky/DialogExport/releases/latest/download/DialogExport-dist.zip" -OutFile "DialogExport-dist.zip"
Expand-Archive -Path ".\DialogExport-dist.zip" -DestinationPath ".\DialogExport" -Force
```

![](./public/use.png)

然后在浏览器里加载：

```text
1. 打开 Chrome 或 Edge 的扩展管理页面
   Chrome: chrome://extensions
   Edge: edge://extensions

2. 打开“开发者模式”

3. 点击“加载已解压的扩展”

4. 选择解压后的 dist 文件夹
   例如：DialogExport\dist
```

==注意：浏览器要加载的是 `dist` 文件夹，不是项目源码根目录。==

如果不想使用命令，也可以到 GitHub Release 页面手动下载 `DialogExport-dist.zip`，解压后同样加载里面的 `dist` 文件夹。

## 支持的平台

- ChatGPT Claude Gemini Grok DeepSeek Kimi 豆包 Doubao Qwen / 通义千问 腾讯元宝 Yuanbao

Google AI Studio 当前不支持。

## 功能

- 支持 Markdown、TXT 和 Word(.doc) 三种导出格式
- 扫描历史会话
- 勾选要导出的历史会话
- 批量导出选中的对话
- 支持停止导出

不同平台的网页结构不同，部分平台可能只支持导出当前对话，历史扫描能力会随版本继续改进。

## 隐私说明

DialogExport 只在浏览器本地运行。扩展只读取当前网页 DOM 中用户自己可见的对话内容，并通过浏览器下载能力保存为本地 Markdown 文件。不会上传聊天内容，不会读取 cookie、token、localStorage 或 IndexedDB。

## 权限说明

扩展使用的权限：

- tabs   scripting  downloads   storage

扩展只申请受支持平台的域名权限，不申请 `<all_urls>`，不申请 `cookies`、`history` 或 `webRequest`。

## 本地开发

```bash
npm install
npm run icons
npm run build
npm run check:release
```

构建完成后，在 Chrome 或 Edge 的扩展开发者模式中加载：

```text
dist
```
