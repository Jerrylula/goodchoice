# Ore Nine：GitHub 上传、Arc 合约和 Cloudflare 部署教程

**答案：合约必须单独部署。** GitHub 只是存放源码；Cloudflare 部署的是网页，不会替你把 Solidity 合约发送到 Arc。顺序是：上传源码 → 在 Arc 主网部署 `OreNine` 合约 → 保存新合约地址 → 配置 Cloudflare 网页 → 给运营金库充值 → 可选部署定时 keeper。旧签到合约和旧网页地址都不能充当九格合约。

## 一、上传 GitHub

1. 下载本项目提供的 `ore-nine-arc-github-upload.zip`，**先解压**。不要把 ZIP 文件本身上传到仓库；GitHub 不会自动将它解压成项目。
2. 登录 GitHub，点击右上角 **+ → New repository**。建议仓库名 `ore-nine-arc`，与原来的 `arcdaily` 分开。创建时可不勾选额外 README 或 `.gitignore`，因为源码包已包含。私有仓库也可以连接 Cloudflare，但需要授权该仓库。
3. 进入新仓库，点 **Add file → Upload files**。打开解压后的文件夹，拖动**里面的全部内容**到 GitHub 上传区域，再点 **Commit changes**。仓库首页应该直接看到 `package.json`、`package-lock.json`、`index.html`、`wrangler.jsonc`、`contracts`、`src`、`scripts` 等；如果首页只看到一个 `ore-nine-arc` 文件夹，说明多套了一层。此时 Cloudflare 根目录应选该子文件夹，或重新上传到仓库根目录。
4. 不要上传钱包私钥、助记词、`.env`、`node_modules`、`dist`、`generated` 或 Wrangler 缓存。源码包没有这些内容。

GitHub 网页支持拖入文件夹；上传后先检查目录结构再开始部署。[GitHub 官方上传说明](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。

## 二、在浏览器里部署 Arc 合约（GitHub Codespaces）

Codespaces 是 GitHub 的云端开发终端；仓库中的 `.devcontainer/devcontainer.json` 会为它选择 Node 22。你不需要让自己电脑持续运行。

1. **单独准备部署钱包。** 这个钱包要有 Arc 主网的**原生 USDC**支付部署 Gas。它部署成功后即是合约 `owner`，以后只有它能提取已结算、未用于开奖的项目手续费。妥善保管它；不要用存放大额资产的主钱包，也不要将私钥发给任何人。Arc 主网链 ID 是 **5042**，RPC 是 `https://rpc.mainnet.arc.io`。[Arc 与 D20DAO 主网参数](https://d20dao.org/docs/deployments)。
2. 在新 GitHub 仓库点绿色 **Code** 按钮 → **Codespaces** → **Create codespace on main**。首次创建需要等待容器启动。[GitHub Codespaces 官方步骤](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)。
3. 在 Codespaces 页面打开下方 **Terminal / 终端**，逐行运行：

   ```bash
   node -v
   npm ci
   npm test
   npm run build
   ```

   `node -v` 应为 22 或更高。测试全部通过、构建结束后才继续。`npm run build` 同时生成 `generated/OreNine.json`，部署脚本需要它。

4. 在**终端**输入下面两行。第一行会提示你粘贴专用部署钱包的私钥，输入时终端**不显示字符**；不要将私钥写入仓库文件或聊天。私钥格式必须是 `0x` 加 64 个十六进制字符。

   ```bash
   read -rsp '输入部署钱包私钥（屏幕不显示）: ' DEPLOYER_PRIVATE_KEY; echo
   export DEPLOYER_PRIVATE_KEY
   ```

5. **先做只读预检**：

   ```bash
   DEPLOY_DRY_RUN=1 npm run deploy:mainnet
   ```

   它会检查 Arc 链 ID、D20DAO 官方清单中的代理与实现地址及链上代码哈希，显示部署钱包地址、原生 USDC 余额、预估 Gas，不会发送交易。检查打印的部署钱包地址是不是你准备的地址。如果余额不够，先给该钱包充值原生 USDC 后再重试。预估 Gas 会随网络情况变化。

6. **真正部署主网合约**：

   ```bash
   npm run deploy:mainnet
   ```

   这一步会发送真实的 Arc 主网交易，并从部署钱包扣 Gas。等待输出 `Deployment transaction`、`Game address`、`Owner`。把 **Game address** 复制到你自己的安全记录中；它是本项目新的九格合约地址，不是 D20DAO 地址，也不是旧签到合约地址。到 [Arc Explorer](https://explorer.arc.io) 搜索交易哈希或合约地址，确认成功及 `Owner` 正确。

7. 在终端清除本次会话中的私钥变量：

   ```bash
   unset DEPLOYER_PRIVATE_KEY
   ```

   然后关闭 Codespaces 终端。下次若重建 Codespaces，需要重新运行 `npm ci`、`npm run build`。部署脚本不会将私钥写入文件或打印到日志。

部署脚本位于 `scripts/deploy.mjs`，只部署 `OreNine.sol`；`MockD20.sol` 仅供本地测试。D20DAO 协调器已经由服务方部署，本项目**不需要**再部署 D20DAO 合约，且应连接官方**代理**地址。当前主网代理地址是 `0xd20da057469C45928912d983F45790C41e290571`，脚本会在发交易前对照[官方部署清单](https://d20dao.org/deployments/arc-mainnet.json)和链上代码核验。若清单或链上实现更新，脚本可能中止；应核对更新后再修改代码，不要绕过检查。

## 三、Cloudflare 部署网页

1. 登录 Cloudflare → **Workers & Pages** → 创建应用/连接 Git 仓库，选择新的 `ore-nine-arc` 仓库。项目名称建议 **`ore-nine-arc`**，要与仓库根目录 `wrangler.jsonc` 的 `name` 一致；旧的 `arcdaily` 项目继续保留。
2. 如果 GitHub 仓库首页直接有 `package.json`，**Root directory / 根目录**填 `/` 或留空。如果首页多了一层 `ore-nine-arc` 文件夹，则填 `ore-nine-arc`。
3. **Build command** 填 `npm run build`；**Deploy command** 填 `npx wrangler deploy`。这是两个不同的输入框。[Cloudflare 构建配置说明](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。
4. 在 **Build variables and secrets / 构建变量**添加两行：

   | Variable name | Variable value |
   | --- | --- |
   | `NODE_VERSION` | `22` |
   | `VITE_GAME_ADDRESS` | 第二步打印的 `Game address`，例如 `0x` 开头的 42 字符地址 |

   左栏只放变量名，右栏只放值；不要把 `VITE_GAME_ADDRESS=0x...` 整串填在某一个栏里。`VITE_GAME_ADDRESS` 是公开合约地址，可放构建变量；**任何私钥都不能放 `VITE_*`**。Cloudflare 支持用 `NODE_VERSION` 指定构建时 Node 版本。[Cloudflare 构建镜像说明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)。
5. 保存后触发构建/部署。成功后打开网页，检查轮次不再显示“尚未配置游戏合约地址”，页面显示 Arc 主网、九格、运营金库和项目手续费。若后来修改合约地址，修改构建变量后**必须重新构建**，单纯刷新网页不会更新 Vite 构建时写入的地址。

## 四、让开奖能运转

合约部署后运营金库初始为 0。用钱包向**九格合约地址**发送少量 **Arc 原生 USDC**（或调用 `fundOperations()`），页面的“运营金库余额”应增加。该余额支付 D20DAO 的实时报价；玩家的投入不能替运营金库垫付。服务费用动态变化，页面显示估价和每轮实际支付额。[D20DAO 收费说明](https://d20dao.org/docs/getting-started)。

网页提供“发起开奖”“完成结算”“超时取消”按钮。网页本身不会自动发送付费交易；若希望无人在线也推进轮次，需要单独部署仓库 `worker/` 中的 **`ore-nine-arc-keeper`**。它用 Durable Object alarm 按链上截止时间尝试发起开奖，开奖请求后每 60 秒检查 D20DAO 结果；每分钟 Cron 只在没有待执行 alarm 时启动或恢复，避免重复请求 RPC。请先核对 `worker/wrangler.jsonc` 的 `GAME_ADDRESS` 是当前九格合约地址，并准备一个有少量 Arc 原生 USDC 的**独立 keeper 钱包**支付其 Gas。然后在 Codespaces 终端依次运行：

```bash
npx wrangler login
npx wrangler deploy --config worker/wrangler.jsonc
npx wrangler secret put KEEPER_PRIVATE_KEY --config worker/wrangler.jsonc
```

先创建并部署独立 Worker，再用第三条命令添加 Secret；第三条命令会提示输入 keeper 钱包私钥。添加完成前若定时任务提前运行，只会报告缺少私钥，不会发送交易。不要把私钥写进仓库、聊天或 `VITE_*` 变量，也不要使用部署钱包。部署后到 Cloudflare 的 `ore-nine-arc-keeper` 项目检查 Cron Trigger 与日志。Cron 配置初次传播可能需要数分钟，最多约 15 分钟；空轮自动取消也要支付 keeper Gas。Cloudflare alarm 或链上交易可能延迟，**不保证每轮一定在合约的 60 秒开奖窗口内完成请求**。若未能按时请求，合约将按规则取消并全额退款。

如果 keeper 日志出现 `rate limit exceeded` 或 RPC 错误码 `-32005`，说明公共 Arc RPC 正在限流。keeper 会延长重试间隔，避免持续请求，但限流期间不能保证及时开奖。需要稳定运行时，可从 [Arc 官方列出的节点服务商](https://docs.arc.io/arc/tools/node-providers)申请**支持 Arc 主网链 ID 5042** 的专用 HTTPS RPC；先在本地用 `eth_chainId` 和合约的 `currentRound()` 验证，再运行 `npx wrangler secret put ARC_RPC --config worker/wrangler.jsonc`，在提示中输入完整 RPC URL。若 URL 含 API key，它只能作为 Cloudflare Secret 保存，不能写入 GitHub、构建变量或聊天。`worker/wrangler.jsonc` 不再声明同名普通变量，未配置 Secret 时默认使用公共 Arc RPC。只读 RPC 检查不支付链上 Gas；每次发起开奖、完成结算或取消是独立链上交易，仍会消耗 keeper 钱包的 Gas。检查间隔改为 60 秒后，完成结算和下一轮开始可能比随机结果到达晚约一分钟。

## 五、测试顺序与常见问题

1. 先用**小额**测试两个不同格子的投入；60 秒截止后发起开奖，等 D20DAO 结果，完成结算，再分别领取。之后测试只有一个格子参与时全额退款。
2. “`InsufficientReserve`”：运营金库不足以付 D20DAO 本次费用，给合约地址转原生 USDC；若已经超过截止+60 秒，则应按规则取消退款。
3. “网页显示未配置合约”：检查 `VITE_GAME_ADDRESS` 是否填在**构建变量**且重新构建。
4. “`package.json` 不存在”：GitHub 目录多套了一层，修改 Cloudflare Root directory 或调整仓库结构。
5. “旧合约能不能直接加项目方提款？”：不能。本合约没有升级入口。新版必须单独部署，新网页填新版合约地址；旧合约上的资金不会自动迁移。
6. “Node 24 提示找不到 `/test`”：旧版上传包的测试脚本把目录当作入口。修正版已改为明确的 `test/round.test.mjs`；若正在旧 Codespaces 中，可先运行 `npm pkg set 'scripts.test=cross-env TEST_EVM=shanghai node scripts/compile.mjs && node --test test/round.test.mjs'`，再运行 `npm test`。
7. “`npm ci` 报审计漏洞”：这是依赖审计提示，不是安装失败。高危报告主要来自仅供本地测试的 Ganache 旧依赖树；项目用到的 `solc` 0.8.28 由 D20DAO 的精确 Solidity 版本约束。不要直接运行 `npm audit fix --force`，它可能替换编译器或测试框架。测试和构建可以继续，但真实资金上线前仍需独立检查依赖与合约。

主网上线前建议安排独立合约审计。D20DAO 是外部可升级服务，它的官方[安全说明](https://d20dao.org/docs/security)明确没有外部审计或公开 SLA；本项目测试通过也不能替代真实资金环境中的审计。
