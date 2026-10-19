# 东畔租房通勤地图

[打开租房地图](https://mx-pai.github.io/dongpan-rent-map/) · [查看流程与数据覆盖](https://mx-pai.github.io/dongpan-rent-map/method.html) · [GitHub Actions](https://github.com/mx-pai/dongpan-rent-map/actions)

以北京东畔科创中心 A 座为终点，比较住宅小区、长租公寓、酒店与青旅的房源信息和实际规划通勤时间

当前快照核查于 2026-10-19，共有74个地图点位，54个满足至少一种完整通勤条件，46个点位收录房源或房型样本，共105条记录，全部点位都有信息状态和缺项说明，地图点位数量与可租房源数量分别计量

## 地图能查什么

页面支持按住宿类型、通勤口径、出租方式、月租样本和独立卫浴筛选，点击点位可以查看步行、骑行、地铁自动全程、分段接驳时间，以及每条房源的面积、房型、卫浴、费用、租期、原始来源与信息日期

租金按具体样本记录，整租和合租分别展示，历史代理房源、搜索抓取文本、已读取的页面和信息冲突均保留标记，青旅独立单人间和多人间床位分开记录，未公开包月价的住宿保留待核对状态

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

浏览器访问 `http://localhost:8000`，使用相对资源路径，可部署在 GitHub Pages 的项目子路径

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

租房及住宿页面需按原始链接人工核对，更新证据JSON后运行 `python3 scripts/import_evidence.py docs/rental-evidence.json`，导入脚本保留路线字段，提交前运行 `python3 scripts/validate.py`

## GitHub Actions 与 Pages

`.github/workflows/pages.yml` 在推送main分支或手动触发时校验数据，构建 `_site/`，上传 Pages 产物并部署到 `github-pages` 环境，仓库 Pages 发布源设置为 **GitHub Actions**

`.github/workflows/refresh.yml` 提供手动路线测量，使用仓库 Secret `AMAP_API_KEY`，默认测量前5个选中点位，结果作为 `refreshed-routes` 产物供下载核对，确认后更新仓库数据并推送即可触发网页发布，公共房源报价不随路线测量自动更新

Pages静态发布不需要高德key，工作流的通勤测量任务才会读取Secret，前端与部署产物的校验会检查常见token、明文key及本机绝对路径

## 来源与边界

高德提供地点和路网信息，房型、费用与租赁线索来自已链接的自如、我爱我家、贝壳、Wellcee、58/安居客、品牌官方及住宿平台，每条样本保留来源页和证据类型，部分网站需要登录或交互验证，当前资料属于公开信息快照，库存、起租期、全部费用及租赁材料按具体房号核对

房源详情及照片的权利属于原发布者，仓库整理可核对的事实字段与来源链接，底图 © 高德地图

参考 [高德地点搜索](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)、[天气](https://lbs.amap.com/api/webservice/guide/api/weatherinfo)、[路径规划](https://lbs.amap.com/api/webservice/guide/api/newroute)、[GitHub Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
