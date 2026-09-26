# 九格页面视觉更新

本次只更新前端 `src/main.ts` 和 `src/style.css`。已部署的游戏合约和独立开奖 Worker 不需要重新部署，也不要重新输入私钥。

页面新增中文／英文切换，选择会保存在当前浏览器；桌面采用左侧九格、右侧操作和结果的布局，手机改为上下排列。当前轮次与上一轮结果可以切换；上一轮结算成功时，中奖格在结果页以金色点亮，在当前轮次下方也有金色的小格提示。取消退款的轮次不会显示虚假的中奖格。钱包恢复连接、投入、开奖推进、领取和项目方手续费入口仍使用原合约。

## 更新已经连接 GitHub 的项目

1. 在 GitHub Codespaces 打开 `goodchoice` 仓库。先运行 `git status`，确认没有未保存的改动；再运行 `git pull --ff-only origin main`。
2. 将本包中的 `src/main.ts` 和 `src/style.css` 覆盖到仓库内同名文件。不要把整个文件夹再套一层上传，也不要上传 `node_modules`、`dist`、`.npm-cache` 或私钥。
3. 在 Codespaces 终端运行 `npm ci`、`npm run build`。已有合约测试也可运行 `npm test`。
4. 检查 `git status`，然后运行：

   ```bash
   git add src/main.ts src/style.css
   git commit -m "Redesign nine-tile game UI with English and mobile layout"
   git push origin main
   ```

5. Cloudflare 的 `goodchoice` 网页项目若已连接 GitHub `main` 分支，推送后会触发新的构建。构建变量 `VITE_GAME_ADDRESS` 保持原游戏合约地址 `0x2EfC136227C623e00071F7cF216aEEaf2f14d452`，不要将变量名和值写在同一个框。
6. 新构建成功后强制刷新网页。点右上角 `EN`／`中文` 检查双语；在手机浏览器检查九格与投入区域。在“上一轮结果”检查中奖格点亮，若该轮取消则应显示取消状态。

若 `git pull --ff-only` 报错，先保留终端信息，不要运行 `git push --force`。
