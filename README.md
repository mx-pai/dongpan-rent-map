# 东畔租房通勤地图

[打开租房地图](https://mx-pai.cn/dongpan-rent-map/) · [查看流程与数据覆盖](https://mx-pai.cn/dongpan-rent-map/method.html) · [GitHub Actions](https://github.com/mx-pai/dongpan-rent-map/actions)

以北京东畔科创中心 A 座为终点，比较住宅小区、长租公寓、酒店与青旅的房源信息和实际规划通勤时间

当前快照核查于 2026-10-19，共有74个地图点位，54个满足至少一种完整通勤条件，46个点位收录房源或房型样本，共118条记录，其中17个原页本次直接读取、8条为读取日7天内的原页报价，其余搜索索引与旧资料收进参考区，全部点位都有信息状态和缺项说明，地图点位数量与可租房源数量分别计量

## 地图能查什么

页面支持按住宿类型、通勤口径、出租方式、月租样本和独立卫浴筛选，点击点位可以查看步行、骑行、地铁自动全程、分段接驳时间，以及每条房源的面积、房型、卫浴、费用、租期、原始来源与信息日期

租金按具体样本记录，整租和合租分别展示，历史代理房源、搜索抓取文本、已读取的页面和信息冲突均保留标记，青旅独立单人间和多人间床位分开记录，未公开包月价的住宿保留待核对状态

地图支持惯性拖动、双指与滚轮缩放、点位聚合展开、路线切换、查看当前路线和全屏，标记保持固定屏幕大小，列表和详情同步选中，备选清单保存在浏览器本地

地点可复制名称、地址、坐标、分享链接和路线文本，清单可复制或导出 CSV / JSON，“带到高德”支持单个地点、步行 / 骑行 / 公共交通规划，以及通勤三段分别打开，备选地点按每组9个住处和A座生成高德多点展示链接，收藏和实时导航在高德中确认

地图 URI 通过[高德官方规范](https://lbs.amap.com/api/uri-api/guide/travel/route)传递坐标和方式，骑行 URI 适用于手机端，高德打开后会按当前条件重新规划，各段截图和时长仍需在 App 内核对

## 通勤怎么计算

步行阈值为1800秒，自行车和地铁全程阈值为1200秒，分段方案把住处到站、地铁入口到北沙滩 A 西北口、出站到 A 座三个规划段按秒相加，地铁段保留站内步行、换乘与预计等车

地铁线路段运行时间另列，便于按“地铁乘车20分钟”的口径筛选，申请时以地图 App 各测距方式页面截图显示的时长加总为准，小区或门店采样坐标与实际楼栋大门可能有差别，选定门址后应复测

坐标使用高德 GCJ-02，地图底图与路线来自高德，范围通过已测点位表达，路线规划快照时刻保存在数据中

## 本地运行

需要 Python 3.11 或更新版本，网页和数据校验使用标准库，无额外安装步骤

```sh
git clone https://github.com/mx-pai/dongpan-rent-map.git
cd dongpan-rent-map
python3 scripts/validate.py
python3 scripts/build.py
python3 -m http.server 8000 --directory _site
```

浏览器访问 `http://localhost:8000`，使用相对资源路径，可部署在 GitHub Pages 的项目子路径，构建时为 JS 和 CSS 加入内容哈希版本号，JSON 每次加载时请求重新验证缓存

## 地点、天气与路径查询

在高德开发者控制台申请 **Web 服务** 类型 key，通过环境变量 `AMAP_API_KEY` 提供，真实 key 留在本机环境或 GitHub Secrets 中，`.env.example` 仅含占位值，Python 不会自动读取 `.env` 文件

```sh
export AMAP_API_KEY='填入自己的Web服务key'
python3 scripts/amap.py search '东畔科创中心A座'
python3 scripts/amap.py detail B0LKY74JQZ
python3 scripts/amap.py weather 110000
python3 scripts/amap.py route '116.366994,39.993409' '116.366962,40.002384' --mode walking
```

高德官方 MCP 提供地点、天气与路线工具，客户端示例保存在 `config/mcp.codex.toml.example`，用真实 key 替换占位值后加入自己的客户端配置，官方接入文档见 [高德 MCP](https://lbs.amap.com/api/mcp-server/summary)

## 更新数据

`site/data.json` 是网页使用的发布快照，`docs/rental-evidence.json` 保存按 POI ID 索引的租赁证据，`config/research.json` 保存采样点和时间条件

重新测量指定点位时运行 `python3 scripts/refresh_routes.py --ids 24`，`--ids` 支持显示编号或高德 POI ID，以逗号分隔，省略时测量全部点位，`--max-points` 可以限制数量，默认0表示全部，日期与时刻可用 `AMAP_TRANSIT_DATE` 和 `AMAP_TRANSIT_TIME` 设置

API响应缓存在被忽略的 `.cache/`，有效期24小时，请求节流和失败重试集中在 `src/amap_research.py`，批次失败时发布快照保持原状，部分重算在每个点位写入测量日期，全量成功后更新整体测量日期

租房及住宿页面需按原始链接人工核对，更新证据JSON后运行 `python3 scripts/import_evidence.py docs/rental-evidence.json`，导入脚本按统一口径重算每条记录的直读状态、房态与读取新鲜度，保留路线字段并写出 `site/evidence-audit.json` 来源统计，提交前运行 `python3 scripts/validate.py`

## 地图底图与交互

网页使用随仓库分发的 Leaflet 1.9.4 与 Leaflet.markercluster 1.5.3，许可证位于 `site/vendor/leaflet/`，运行时资源来自站点自身

`site/maps/` 提供缩放 11 到 16 共6个级别、合计99个离线底图分块与一张范围外占位图，浏览器按当前缩放和可见区域加载，未采集的坐标改用占位图，地图展示本次找房区域，各级分块范围与底图快照日期记录在 `site/maps/manifest.json` 中，图像与高德路线都使用 GCJ-02 坐标

底图通过官方静态地图 API 获取，运行 `python3 scripts/cache_basemap.py` 可补齐缺失分块，使用环境变量 `AMAP_API_KEY`，`--force` 可重新采集，采样范围从发布快照中的POI坐标加边距计算，分块尺寸与地理边界保存在 `site/maps/manifest.json`

前端地图交互在 `site/map.js`，高德 URI 编排在 `site/amap-links.js`，界面和复制、备选、筛选在 `site/app.js`，手机使用可展开的地点面板，减少动效偏好应用到地图动画，浏览器未允许自动复制时提供可选中的文本

## GitHub Actions 与 Pages

`.github/workflows/pages.yml` 在推送main分支或手动触发时校验数据，构建 `_site/`，运行桌面与手机浏览器检查，上传 Pages 产物并部署到 `github-pages` 环境，仓库 Pages 发布源设置为 **GitHub Actions**

`.github/workflows/refresh.yml` 提供手动路线测量，使用仓库 Secret `AMAP_API_KEY`，默认测量前5个选中点位，结果作为 `refreshed-routes` 产物供下载核对，确认后更新仓库数据并推送即可触发网页发布，公共房源报价不随路线测量自动更新

Pages静态发布不需要高德key，工作流的通勤测量任务才会读取Secret，前端与部署产物的校验会检查常见token、明文key及本机绝对路径

## 浏览器验证

发布工作流使用 Playwright 检查地图加载、单地点筛选后的标记、地点复制、三段高德路线参数、地点组上限、全屏和手机布局，检查通过后再部署，测试读取本地快照并启动本地服务器

本机运行这组检查需要 Node.js 22 或更新版本：

```sh
npm ci
npx playwright install chromium
python3 scripts/build.py
npm run check:browser
```

## 来源与边界

高德提供地点和路网信息，房型、费用与租赁线索来自已链接的自如、我爱我家、贝壳、Wellcee、58/安居客、品牌官方及住宿平台，每条样本保留来源页和证据类型，部分网站需要登录或交互验证，当前资料属于公开信息快照，库存、起租期、全部费用及租赁材料按具体房号核对

房源详情及照片的权利属于原发布者，仓库整理可核对的事实字段与来源链接，底图 © 高德地图

参考 [高德地点搜索](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)、[天气](https://lbs.amap.com/api/webservice/guide/api/weatherinfo)、[路径规划](https://lbs.amap.com/api/webservice/guide/api/newroute)、[GitHub Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
