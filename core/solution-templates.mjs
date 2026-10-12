import { validateDefinition } from './definition.mjs';

// Curated configuration recipes. These contain no executable code or credentials.
export const solutionTemplates = [
  { id: 'writing', name: '资料写作助手', category: '写作与内容', accent: 'sage', layout: 'materials-editor',
    headline: '把零散资料，变成一篇好文章。', description: '整理来源、提炼要点，再写成可编辑的文稿。',
    audience: '自己和团队成员', goal: '根据提供的资料，整理有出处的要点，生成清晰、可继续修改的文稿。',
    inputLabel: '这次想写什么？', actionLabel: '整理并起草', outputTitle: '文稿',
    steps: ['核对资料与来源', '整理提纲与分歧', '起草并保留修改'],
    exampleInput: '用两份虚构项目记录，写一篇面向团队的进展说明。',
    exampleTitle: '让团队看见项目进展', exampleLines: ['本周完成了首轮方案评审。', '目前仍需确认两个细节。', '下一步：结合反馈调整试用范围。'],
    bestFor: ['资料整理', '文章起草', 'Markdown 导出'] },
  { id: 'weekly', name: '每周简报', category: '团队与工作', accent: 'blue', layout: 'materials-editor',
    headline: '每周的进展，清楚地说出来。', description: '把工作记录整理成进展、风险和下一步。',
    audience: '团队负责人', goal: '将手动提供的工作记录整理为周报，突出进展、阻碍和下一步，不编造完成情况。',
    inputLabel: '这份简报面向谁，重点是什么？', actionLabel: '生成本周简报', outputTitle: '本周简报',
    steps: ['提取已完成事项', '区分风险与待确认项', '整理下周行动'],
    exampleInput: '整理这周三次项目讨论的虚构记录，给负责人看。',
    exampleTitle: '本周，向前一步', exampleLines: ['完成 · 试用方案确认', '关注 · 两项反馈待核实', '下周 · 组织第二轮试用'],
    bestFor: ['工作周报', '项目复盘', '团队简报'] },
  { id: 'reading', name: '阅读与学习伙伴', category: '学习与整理', accent: 'purple', layout: 'conversation',
    headline: '读懂一份资料，再往前想一步。', description: '梳理概念、解释难点，用追问帮助理解。',
    audience: '个人学习者', goal: '围绕用户提供的阅读材料解释概念、整理笔记，通过提问核对理解，标出材料未说明的部分。',
    inputLabel: '正在读什么，想弄懂哪里？', actionLabel: '整理学习笔记', outputTitle: '学习笔记',
    steps: ['确认学习问题', '结合材料解释概念', '提问并整理笔记'],
    exampleInput: '读完这段虚构的产品研究摘要，帮我找出核心假设。',
    exampleTitle: '从“看过”到“理解”', exampleLines: ['核心概念 · 先验证问题，再决定方案', '待核实 · 摘要没有提供样本范围', '想一想 · 什么证据会改变这个结论？'],
    bestFor: ['阅读理解', '概念解释', '学习笔记'] },
  { id: 'support', name: '客户答复助手', category: '团队与工作', accent: 'amber', layout: 'form-results',
    headline: '有依据地回答，也留有人情味。', description: '根据问题和业务规则起草答复，由你确认。',
    audience: '客户服务人员', goal: '根据手动提供的客户问题与业务规则起草答复，缺少依据时先询问，不自动发送或承诺退款。',
    inputLabel: '客户问题与可引用的业务规则', actionLabel: '起草答复', outputTitle: '待确认答复',
    steps: ['理解问题与诉求', '核对提供的规则', '生成待确认答复'],
    exampleInput: '虚构场景：客户询问试用进度。规则：待确认日期，不承诺具体上线时间。',
    exampleTitle: '一份有分寸的答复', exampleLines: ['您好，已收到您的试用进度咨询。', '具体时间仍在确认中，感谢您的耐心。', '发送前请核对进度与客户称呼。'],
    bestFor: ['客户答疑', '回复草稿', '人工确认'] },
  { id: 'decision', name: '方案比较助手', category: '分析与决策', accent: 'rose', layout: 'form-results',
    headline: '把选择摊开，找到自己的判断。', description: '按你重视的维度比较方案，呈现依据和未知。',
    audience: '需要做选择的个人或团队', goal: '依据用户提供的信息和比较维度分析多个方案，区分事实、假设与未知，保留最终判断给用户。',
    inputLabel: '候选方案、比较维度与已知信息', actionLabel: '比较这些方案', outputTitle: '方案比较',
    steps: ['确认决策维度', '逐项比较依据', '列出取舍与未知'],
    exampleInput: '虚构方案 A 重视易用性，方案 B 更灵活。比较首次试用的选择。',
    exampleTitle: '先看清取舍', exampleLines: ['方案 A · 更容易开始', '方案 B · 配置空间更大', '待核实 · 维护成本与实际使用反馈'],
    bestFor: ['多方案比较', '优劣分析', '决策备忘'] },
  { id: 'rewrite', name: '内容改写工作室', category: '写作与内容', accent: 'cyan', layout: 'materials-editor',
    headline: '同一个意思，找到合适的表达。', description: '保留原意，为不同读者调整结构和语气。',
    audience: '内容创作者', goal: '保留原文事实和核心含义，根据目标读者调整语气、篇幅与结构，不增添未经证实的信息。',
    inputLabel: '原文、目标读者与改写要求', actionLabel: '生成改写稿', outputTitle: '改写稿',
    steps: ['确认不可改动的事实', '调整结构与表达', '列出主要修改'],
    exampleInput: '把这段虚构项目说明改成一段简短、友好的邀请。',
    exampleTitle: '让表达更贴近读者', exampleLines: ['我们正在准备一次小范围试用。', '欢迎体验，并告诉我们哪里需要改进。', '这是一份演示文案，没有对外发布。'],
    bestFor: ['文案润色', '语气调整', '多版本改写'] },
];

export function getSolutionTemplate(id) {
  const template = solutionTemplates.find(t => t.id === id);
  if (!template) throw new Error('请选择一个有效的应用模板。');
  return template;
}
export function templateDefaults(id) {
  const t = getSolutionTemplate(id);
  return { templateId: t.id, name: t.name, goal: t.goal, audience: t.audience, tone: '清晰、自然', confirm: t.id === 'support' };
}
export function instantiateTemplate(applicationId, config) {
  const t = getSolutionTemplate(config.templateId);
  for (const key of ['name', 'goal', 'audience', 'tone'])
    if (typeof config[key] !== 'string' || !config[key].trim() || config[key].length > (key === 'goal' ? 2000 : 120))
      throw new Error('请补全应用名称、用途、使用者和表达风格。');
  const slug = 'template-' + t.id;
  const method = `${t.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n只依据用户提供的材料，不虚构事实、引用或已完成的操作。遇到信息缺口先询问；保留用户已作的修改。输出到指定工作区文件。`;
  return validateDefinition({
    schemaVersion: 2, applicationId, name: config.name.trim(), version: '0.1.0', description: config.goal.trim(),
    expert: {
      systemPrompt: `你是${config.name.trim()}，基于“${t.name}”模板配置。\n任务目标：${config.goal.trim()}\n使用者：${config.audience.trim()}\n表达风格：${config.tone.trim()}\n每次处理任务先读取说明型技能 skills/${slug}/SKILL.md。\n${method}\n只使用已绑定的 WANX 能力。没有连接器时仅处理用户手动提供的输入。`,
      welcomeMessage: `${t.headline} ${t.inputLabel}`,
    },
    ui: { templateId: t.layout, templateVersion: 1 },
    capabilities: [{ id:'reasoning', kind:'model', source:'default', label:'模型理解与生成' },{ id:'method', kind:'instruction-skill', source:slug, label:t.name+'方法' }],
    dependencies: { connectors:[], skillPackages:[], knowledgeBases:[], skills:[{ slug, content:`---\nname: ${slug}\ndescription: ${t.description}\n---\n${method}`, files:[] }] },
    components: [
      { id:'intro',kind:'text',title:config.name.trim(),text:t.description },
      ...(t.layout === 'materials-editor' ? [{id:'files',kind:'upload',title:'添加参考资料'}] : []),
      {id:'request',kind:'form',title:t.inputLabel,field:'request',actionId:'generate'},
      {id:'result',kind:t.layout==='conversation'?'detail':'editor',title:t.outputTitle,path:'outputs/result.md'},
      {id:'progress',kind:'progress',title:'任务进度'},
      {id:'history',kind:'list',title:'已保存的结果',path:'outputs'},
      {id:'conversation',kind:'chat',title:'继续交流'},
    ],
    actions:[{id:'generate',label:t.actionLabel,prompt:`读取 skills/${slug}/SKILL.md，按照该方法和用户输入 request 完成任务。若有附件，将其作为参考资料；没有附件时使用输入中的材料。更新前先检查 outputs/result.md，保留用户已作的修改。`,resultPath:'outputs/result.md',requiresConfirmation:Boolean(config.confirm),capabilityIds:['reasoning','method'],inputs:[{id:'request',label:t.inputLabel,required:true}]}],
    automations:[],
    acceptance:[`输入“${t.exampleInput}”后，产出有依据的${t.outputTitle}。`,'资料不足时说明缺口，不编造来源或执行结果。','保存和导出结果后，重新打开应用仍可查看。'],
  });
}

export function templateBrief(config) {
  const t=getSolutionTemplate(config.templateId);
  return `# 模板配置\n\n模板：${t.name}\n模板标识：${t.id}\n模板版本：1\n应用名称：${config.name}\n使用者：${config.audience}\n用途：${config.goal}\n表达风格：${config.tone}\n任务前确认：${config.confirm?'是':'否'}\n\n这是用户从模板创建的新项目。初始定义属于本项目，不是另一个历史应用。沿用 applicationId，在模板基础上配置；不要再次询问从零开始还是复用旧应用。连接器为可选扩展，需读取真实目录并获得原生授权后才可绑定。`;
}
