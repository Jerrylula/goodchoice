# Ore Nine · Arc

新手上传 GitHub、单独部署合约及 Cloudflare 网页的逐步说明见 [部署教程](DEPLOY_GUIDE_ZH.md)。

独立的 Arc 主网 3×3 九格游戏，借鉴 [ORE](https://github.com/regolith-labs/ore) 的“按轮投入、截止、开奖、领取”流程。不是 ORE 的 Solana 程序移植，也不改动原签到项目。

## 规则

- 每轮由合约开启，60 秒后自动拒绝新的投入。格子编号 1–9。
- 只对参与格开奖：D20DAO `ChooseOne` 在已参与格中等概率选一格。每轮独立，允许同格连续获胜。
- 每次投入按毛额扣 0.5%，剩余为净投入。没有再次收取项目领取费。
- 结算后，失败格合计净投入的 30% 返还给失败者，其余 70% 按获胜格各钱包的净投入比例分配给获胜者；获胜者也取回自己的净投入。小于 1 wei 的舍入尾差归最后一位领取者。
- 截止时参与格少于两个，直接取消。截止后 60 秒内没有链上有效随机结果，也可取消；取消后玩家领取**全部毛额（包含曾预扣的 0.5%）**。交易 Gas 无法退款。
- 同时只开放一轮。上一轮结算或取消后，在同一笔交易中开启下一轮；旧轮的领取可延后。

运营金库由赞助转入和**成功结算的** 0.5% 手续费累积。D20DAO 费用由它支付，玩家资金不用于开奖支出。部署钱包可调用公开的 `withdrawFees(amount)` 提取**已结算、尚未用于开奖**的手续费；未结算手续费、玩家待领取本金和奖金、赞助金不可提。`withdrawableFees()` 显示当前上限，页面也显示该数额，并仅向部署钱包展示提取按钮。开奖优先使用赞助金，再使用可提手续费，因此实际可提金额可能减少。提取手续费会减少后续开奖预算；若金库不足，本轮可能到期取消退款。

0.5% 可能不足以覆盖每轮 D20DAO 费用及 keeper Gas，需要按实际投入额和费率持续观察并向合约补足金库。直接向合约地址转入 Arc 原生 USDC 或调用 `fundOperations()` 均可。钱包发起的每笔交易仍由钱包自己支付 Arc Gas。

## 状态与异常

1. `Open`：可在截止前投入。
2. 截止后，任何人可调用 `requestDraw()`。不足两格则取消；合约金库不够 D20DAO 实时报价时，该函数会回退，截止+60 秒后可全额取消。
3. `Drawing`：D20DAO 接受证明后，任何人调用 `finalize()` 读取协调器**原请求**的映射结果。即使回调失败，也能读取同一结果完成结算，不会重抽。
4. 截止+60 秒仍没有有效链上结果，任何人调用 `cancelExpired()`；若结果已经可读，该函数拒绝取消，应调用 `finalize()`。之后到达的旧结果不改变已经取消的轮次。
5. D20DAO 自身的请求有效期从发起请求时计算，也是 60 秒，可能晚于本游戏的截止+60 秒。若请求过期且游戏已取消，任何人可调用 `refundExpiredOracleRequest(roundId)` 向 D20DAO 索回可退的开奖费。D20DAO 若将退款记为 credit，调用 `recoverOracleCredit()` 收回金库。

独立的 Cloudflare keeper 使用 Durable Object alarm 按本轮截止时间尝试发起开奖，并每 60 秒检查 D20DAO 结果；每分钟的 Cron 仅在没有待执行 alarm 时启动与恢复，避免重复读取。页面显示距可发起开奖、开奖请求窗口及等待随机结果的状态。只读检查不消耗链上 Gas，实际发起开奖、结算与取消交易各自消耗 keeper Gas。**任何后台调度都不保证在精确秒数发交易**；Cloudflare alarm 可能延迟，链上交易也可能失败。若超过合约的 60 秒开奖窗口，本轮按链上规则取消退款。页面保留公开操作按钮，keeper 离线时任何钱包仍可自行付 Gas 推进。

## 本地检查

需要 Node.js ≥22.13。执行：

```bash
npm ci
npm test
npm run build
```

测试使用 Ganache 的 Shanghai EVM 编译版本；**发布构建**使用 Solidity 0.8.28 + Cancun，符合 D20DAO SDK 要求。测试的 `MockD20.sol` 仅供本地使用，部署脚本只部署 `OreNine.sol`。

## Arc 主网部署顺序

**先做独立审计和小额试运行，再允许真实玩家投入。** 本项目尚未经过外部审计；测试通过不等于资金安全保证。

1. 在 Arc 主网准备一个有原生 USDC 支付合约部署 Gas 的部署钱包，并保管好私钥。不要把私钥上传 GitHub、Cloudflare 构建变量或 `VITE_*`。
2. 在本项目目录执行 `npm ci && npm run build`。
3. 在本机 shell 临时设置 `DEPLOYER_PRIVATE_KEY`；可选设置 `ARC_RPC`。执行 `node scripts/deploy.mjs`。脚本会先检查链 ID，以及 D20DAO 官方部署清单中代理和实现合约的地址、链上代码哈希，检查失败时中止。
4. 保存打印的游戏合约地址和交易哈希，在 [Arc 浏览器](https://explorer.arc.io) 核验。通过 `fundOperations()` 或直接转入原生 USDC，给金库准备足够的 D20DAO 费用。D20DAO 主网代理地址由[官方部署表](https://d20dao.org/docs/deployments)核对；本脚本目前使用 `0xd20da057469C45928912d983F45790C41e290571`。
5. Cloudflare Workers & Pages 中将**本目录**作为新项目的仓库根目录。Build command 为 `npm run build`，Deploy command 为 `npx wrangler deploy`（使用根目录 `wrangler.jsonc`），Node 版本设置 ≥22.13。构建变量 `VITE_GAME_ADDRESS` 填游戏合约地址，值栏只填 `0x...` 地址。重新构建后打开网页检查轮次与金库显示。
6. 自动 keeper 使用 `worker/wrangler.jsonc`；确认其中的 `GAME_ADDRESS` 为当前游戏合约。先准备独立 keeper 钱包并存入少量 Arc 原生 USDC 支付每次交易 Gas，然后运行 `npx wrangler login`、`npx wrangler deploy --config worker/wrangler.jsonc` 和 `npx wrangler secret put KEEPER_PRIVATE_KEY --config worker/wrangler.jsonc`。先创建 Worker 再添加 Secret；添加完成前若定时任务运行，只会报缺少私钥，不会发交易。私钥只在 Wrangler 的 Secret 提示中输入，**不要**用部署钱包，也不要放进 GitHub 或 `vars`。此步骤部署的是第二个 Worker `ore-nine-arc-keeper`，不是重部署游戏合约。检查其 Cron Trigger 和日志；Cron 初次生效可能延迟。空轮也会消耗 keeper Gas 才能推进。
7. 要提取手续费，用**部署合约时的同一钱包**连接页面，在“项目方手续费”框输入金额，或点击“全部可提”，确认交易。合约固定转给部署钱包，无法指定其他收款人。不要把该钱包私钥交给 Cloudflare 或其他人。
8. 在小额试运行期间依次检查两格参与、开奖、两类玩家领取、单格取消和超时取消。持续监测 D20DAO 实际服务费、金库、keeper 钱包余额。

如果只部署页面，不部署 keeper，页面依然可以由在线用户调用公开操作按钮推进轮次。没有人触发时，游戏会停留在已截止的旧轮，下一轮不会自动开始。

## 边界与依赖

- [Arc 主网](https://docs.arc.io/arc/concepts/stablecoin-native-model)的原生 USDC 是 18 位小数；不要将 ERC-20 USDC 的 6 位小数代入 `msg.value`。
- [D20DAO](https://d20dao.org/docs/security) 是独立、可升级的第三方服务，当前服务模型不是完全去中心化，且其 SDK 提示尚未经过外部安全审计。合约锁定 D20DAO 提供的映射结果，无法防止服务方不按时交付。玩家应理解开奖服务及超时取消依赖。
- 合约不含升级权限，部署后不可修改规则，也不可给已有的旧合约补加提取函数；旧版若已部署，必须部署此新版合约并切换页面地址。部署钱包拥有公开、受额度限制的手续费提取权；前端地址只影响展示与交互。
- 页面查询最近 10 轮的本钱包投入。完整历史可按合约事件和 `grossStake(roundId,address)` 查询。
- ORE 原项目的软件许可与本项目实现应分别核查；这里未复制 ORE 的 Solana 程序代码。
