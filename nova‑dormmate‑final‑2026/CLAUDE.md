# DormMate‑Final 项目说明
## 项目背景
NOVA C01 DormMate Final挑战，各个模块代码存放位置：
- M1 Web主应用 → web/
- M2离线分析 → analysis/
- M4移动端小程序 → miniapp/
- M5实时仪表盘 → dashboard/
- M6 3D场景 →3d/

## 统一环境判断规则，全项目所有模块必须严格遵守
1. 温度＜18 → 偏冷
2. 温度≥30 → 偏热
3. 18 ≤温度＜30，湿度≥75 → 偏湿
4. 其余情况 → 正常

## 数据规范，全项目所有模块必须严格遵守
1. CSV 表头固定为：`nodeId,temperature,humidity,status,time`
   - nodeId：节点标识。当前 M1‑M4 阶段每条记录固定 nodeId = dorm-a；后续 M5 阶段将增加 dorm-b、dorm-c 等多节点，届时仅修改 nodeId 填入的值，CSV 表头和 JSON 结构保持不变
   - temperature：温度数值（℃，合理范围 0~50）
   - humidity：湿度数值（%，合理范围 0~100）
   - status：环境状态（偏冷/偏热/偏湿/正常，与统一环境判断规则一致）
   - time：记录时间，ISO 8601 格式（YYYY-MM-DDTHH:mm:ss）

## AI工作约束
1. 收到开发任务，优先输出分步实施计划，包含步骤、测试点、完成标准；
2. 需要我确认计划可行之后，再生成代码；
3. 代码生成结束后，对照任务要求做自检；
4. 代码放到指定文件夹，不要随意改动现有目录结构。

<begin‑end>
