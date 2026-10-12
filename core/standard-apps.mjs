import directory from './expert-directory.json' with { type: 'json' };
import {validateDefinition} from './definition.mjs';
export const taskTypes = [
 {id:'creation-studio',name:'内容创作',accent:'sage',input:'主题、读者与创作要求',output:'作品',format:'editor',summary:'素材、任务与作品编辑'},
 {id:'analysis-dashboard',name:'观察与分析',accent:'blue',input:'分析对象、时间范围与问题',output:'分析结果',format:'table',summary:'条件、指标、图表与明细'},
 {id:'operations-console',name:'检查与运维',accent:'amber',input:'目标、现象与检查范围',output:'检查清单',format:'checklist',summary:'检查任务、问题与确认'},
 {id:'learning-studio',name:'学习与训练',accent:'purple',input:'学习目标、当前程度与材料',output:'学习任务',format:'checklist',summary:'学习目标、练习与反馈'},
 {id:'office-workbench',name:'办公与文档',accent:'cyan',input:'文件、背景与处理要求',output:'工作成果',format:'editor',summary:'文件、处理任务与成果'},
 {id:'decision-room',name:'方案与决策',accent:'rose',input:'问题、候选方案与决策依据',output:'方案比较',format:'board',summary:'问题、方案卡片与决策记录'},
 {id:'service-planner',name:'生活与服务',accent:'amber',input:'需求、限制条件与偏好',output:'服务方案',format:'board',summary:'需求、方案与行动安排'},
 {id:'engineering-workbench',name:'编程与工程',accent:'blue',input:'项目背景、文件与工程要求',output:'工程结果',format:'detail',summary:'项目输入、工程任务与检查结果'},
];
const builtinMap={
 'ai-coding-coach':'learning-studio','ai-safety-guardian':'operations-console','clinical-learning-subscription':'learning-studio',
 'cvm-ai-doctor':'operations-console','cvm-cluster-doctor':'operations-console','default':'decision-room','general-assistant':'decision-room',
 'karpathy-knowledge-base':'learning-studio','meituan-living-assistant':'service-planner','multi-agent-orchestrator':'decision-room',
 'news-trend':'analysis-dashboard','office-automation':'office-workbench','ops-engineer':'operations-console','parenting-companion':'service-planner',
 'stock-assistant':'analysis-dashboard','superpowers-methodology':'engineering-workbench','tencentcloud-api':'engineering-workbench',
 'wechat-ops':'creation-studio','zhijun-personal-companion':'service-planner',
};
export const textOf=v=>typeof v==='string'?v:(v?.zh||v?.en||'');
export function classifyExpert(e){
 if(builtinMap[e.id])return builtinMap[e.id];
 if(e.id?.startsWith('brainstorm-'))return 'decision-room';
 const s=`${e.slug||e.id} ${textOf(e.label)} ${e.sub_scene||''}`;
 if(/analysis|assessment|screening|backtesting|profiling|selection|pricing|risk|research|search|分析|评估|检索|筛选/.test(s))return 'analysis-dashboard';
 if(e.scene==='tech')return 'engineering-workbench';
 if(e.scene==='education'||/学习|training|quiz|lesson|高考/.test(s))return 'learning-studio';
 if(['lifestyle','mysticism','healthcare'].includes(e.scene))return 'service-planner';
 if(['content-creation','media','design'].includes(e.scene)||/copywriting|drafting|generation|创作|文案|合同/.test(s))return 'creation-studio';
 return 'decision-room';
}
export function normalizeExpert(e,sourceKind=e.sourceKind||'market'){
 const categoryId=classifyExpert(e),category=taskTypes.find(t=>t.id===categoryId);
 const prompts=(e.quick_prompts||[]).map(p=>({title:textOf(p.title),description:textOf(p.description),prompt:textOf(p.prompt)})).filter(p=>p.title&&p.prompt);
 return {id:`${sourceKind}:${e.id}`,expertId:e.id,slug:e.slug||e.id,sourceKind,name:textOf(e.label)||e.name||e.id,
 description:textOf(e.description),categoryId,category:category.name,accent:category.accent,layout:categoryId,
 scene:e.scene||'builtin',quickPrompts:prompts,skillSlugs:e.skill_slugs||[],method:(Array.isArray(e.file_contents)?e.file_contents.map(f=>[f.name||f.path,f.content]):Object.entries(e.file_contents||{})).filter(([k])=>/^(SOUL|IDENTITY|AGENTS)\.md$/.test(k)).map(([k,v])=>`# ${k}\n${v}`).join('\n\n')||textOf(e.content),
 welcome:textOf(e.welcome_message),availability:e.availability||'unknown',snapshotDate:directory.capturedAt};
}
export const standardApps=[...directory.builtin.map(e=>normalizeExpert(e,'builtin')),...directory.market.map(e=>normalizeExpert(e,'market'))];
export const directoryMetadata={capturedAt:directory.capturedAt,builtinCount:directory.builtin.length,marketCount:directory.market.length,marketSource:directory.marketSource};
export const getStandardApp=id=>{const app=standardApps.find(a=>a.id===id);if(!app)throw Error('应用目录中没有这个专家，请刷新目录。');return app;};
export function standardDefaults(app){return {appId:app.id,name:app.name,goal:app.description.slice(0,2000),audience:'我自己',tone:'清晰、自然',confirm:['operations-console','service-planner'].includes(app.categoryId)};}
export function standardBrief(app,config){return `# 标准应用配置\n\n专家来源：${app.sourceKind}\n专家标识：${app.expertId}\n应用类型：${app.category}\n应用名称：${config.name}\n用途：${config.goal}\n使用者：${config.audience}\n表达风格：${config.tone}\n\n用户已选择这个标准应用。保留当前 applicationId 和专家原始方法，直接修改对应构建物的内容、任务、能力绑定和 UI；不要重新询问选择哪个应用。按钮绑定任务，结果读取实际输出。只有用户明确需要时添加交流组件。`;
}
export function instantiateStandardApp(applicationId,app,config,bindings={packages:[],tools:[],connectors:[]}){
 const type=taskTypes.find(t=>t.id===app.categoryId);if(!type)throw Error('未知应用类型');
 for(const k of ['name','goal','audience','tone'])if(typeof config[k]!=='string'||!config[k].trim())throw Error('请补全应用配置');
 if(!app.method)throw Error('尚未取得专家的完整工作方法，请连接万象后重新读取。');
 const prompts=app.quickPrompts.length?app.quickPrompts:[{title:'处理当前任务',description:app.description,prompt:app.method.slice(0,10000)}];
 const caps=[{id:'reasoning',kind:'model',source:'default',label:'模型处理'},{id:'method',kind:'instruction-skill',source:'expert-method',label:app.name+'方法'},
 ...bindings.packages.map((p,i)=>({id:'package-'+i,kind:'skill-package',source:p,label:'专家技能包 '+(i+1)})),
 ...bindings.tools.map((t,i)=>({id:'tool-'+i,kind:'builtin',source:t,label:t})),
 ...bindings.connectors.map((t,i)=>({id:'connector-'+i,kind:'connector',source:t,label:t}))];
 const jsonSchema=type.format==='table'?'JSON 对象包含 columns（列名字符串数组）、rows（字符串或数值的二维数组）、metrics（可选真实数值指标，元素为 label/value/unit）。':type.format==='board'?'JSON 对象包含 items 数组，每项包含 title、status、detail，状态由真实依据决定。':type.format==='checklist'?'JSON 对象包含 items 数组，每项包含 title、checked（布尔值）、detail；未完成的项目必须 checked=false。':'';
 const actions=prompts.slice(0,8).map((p,i)=>({id:'task-'+(i+1),label:p.title.slice(0,100),prompt:`读取 skills/expert-method/SKILL.md。保留原专家的方法，执行以下任务：\n${p.prompt}\n用户要求通过 request 提供，参考资料通过 materials 提供。已有技能包：${bindings.packages.join(",")}。先从实际挂载目录读取相关 SKILL.md，再使用对应能力。${jsonSchema}所有结论必须来自实际材料或已授权工具，不编造执行状态。`,resultPath:`outputs/task-${i+1}.${jsonSchema?'json':'md'}`,requiresConfirmation:!!config.confirm,capabilityIds:caps.map(c=>c.id),inputs:[{id:'request',label:type.input,required:true}]}));
 const components=[{id:'intro',kind:'text',title:config.name.slice(0,100),text:config.goal.slice(0,20000)},{id:'materials',kind:'upload',title:'参考资料'},...actions.flatMap((a,i)=>[
 {id:'input-'+i,kind:'form',title:prompts[i].description.slice(0,100)||type.input,field:'request',actionId:a.id},
 {id:'result-'+i,kind:type.format,title:a.label+' · '+type.output,path:a.resultPath,actionId:a.id},
 ...(type.format==='table'?[{id:'chart-'+i,kind:'chart',title:'指标视图',path:a.resultPath,actionId:a.id}]:[])]),{id:'status',kind:'progress',title:'执行状态'},{id:'history',kind:'list',title:'已保存的成果',path:'outputs'}];
 return validateDefinition({schemaVersion:2,applicationId,version:'0.1.0',name:config.name.slice(0,120),description:config.goal.slice(0,20000),
 expert:{...(bindings.nativeTemplate?{templateId:bindings.nativeTemplate}:{}),systemPrompt:`你是${config.name}。\n任务目标：${config.goal}\n使用者：${config.audience}\n表达风格：${config.tone}\n来源专家：${app.sourceKind}/${app.expertId}\n${app.method}\n\n执行每项任务前读取 skills/expert-method/SKILL.md。只使用定义中已绑定的 WANX 能力；现有技能由 WANX 技能包管理，从实际挂载目录读取和运行原程序，不生成新脚本。结果写入指定 outputs 文件，保留用户资料与修改。`,welcomeMessage:(app.welcome||`选择一项任务，填写要求后开始。`).slice(0,500)},
 ui:{templateId:type.id,templateVersion:1},capabilities:caps,dependencies:{connectors:bindings.connectors,knowledgeBases:[],skillPackages:bindings.packages,skills:[{slug:'expert-method',content:'---\nname: expert-method\ndescription: '+JSON.stringify(app.name+' task method')+'\n---\n\n'+app.method.slice(0,78000),files:[]}]},components,actions,automations:[],acceptance:actions.map(a=>`从界面执行“${a.label}”，使用原专家方法并生成实际结果 ${a.resultPath}。`)});
}
