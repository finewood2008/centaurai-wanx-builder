"""Deterministic model for isolated E2E: real WANX tools, no network model call."""
import re
import json
from pathlib import Path
from typing import Any
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult


class CompositionModel(BaseChatModel):
    @property
    def _llm_type(self):
        return "isolated-composition-fixture"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs: Any):
        index=next((i for i in range(len(messages)-1,-1,-1) if messages[i].type=='human'),-1)
        text=str(messages[index].content) if index>=0 else ''
        match=re.search(r'\[WANX_ACTION:([a-z0-9-]+)\]',text)
        calls=[]
        if '[BUILDER_EDIT_TEST]' in text:
            results=[m for m in messages[index+1:] if m.type=='tool']
            if not results:
                calls=[{'id':'builder-read','name':'read_file','args':{'file_path':'builder/application.json','limit':2000}}]
            elif len(results)==1:
                source_lines=[]
                for line in str(results[0].content).splitlines():
                    numbered=re.match(r'^\s*\d+(\.\d+)?  (.*)$',line)
                    if numbered:
                        if numbered.group(1) and source_lines:source_lines[-1]+=numbered.group(2)
                        else:source_lines.append(numbered.group(2))
                raw='\n'.join(source_lines)
                start=raw.find('{');end=raw.rfind('}')+1
                value=json.loads(raw[start:end])
                value['description']='为项目负责人整理办公成果，并在导出前核对要求。'
                value['expert']['systemPrompt']+='\n用户当前用途：'+value['description']
                value['actions'][0]['label']='分析表格并核对'
                value['actions'][0]['prompt']+='\n结果中增加导出前核对清单。'
                value['ui']['templateId']='creation-studio'
                value['components'].insert(1,{'id':'review-note','kind':'text','title':'导出前核对','text':'核对对象、时间范围和输出要求。'})
                calls=[{'id':'builder-write','name':'write_file','args':{'file_path':'builder/application.json','content':json.dumps(value,ensure_ascii=False)}}]
        elif match:
            results=[m for m in messages[index+1:] if m.type=='tool']
            action=match.group(1)
            path='outputs/notes.md' if action=='compare' else 'outputs/draft.md'
            # Exact paths are supplied in the action's native prompt.
            output=re.findall(r'outputs/[a-zA-Z0-9_./-]+\.(?:md|json)',text)
            if output:path=output[-1]
            if not results:
                skill=re.search(r'skills/[a-z0-9-]+/SKILL\.md',text)
                calls=[{'id':action+'-method','name':'read_file','args':{'file_path':skill.group(0) if skill else 'skills/source-comparison/SKILL.md'}}]
            elif len(results)==1 and '已有技能包：' in text and re.search(r'已有技能包：([^。]+)',text).group(1).strip():
                package=re.search(r'已有技能包：([^。]+)',text).group(1).split(',')[0]
                candidates=list(Path.home().rglob(package+'/skills/*/SKILL.md'))
                if candidates:
                    calls=[{'id':action+'-package','name':'read_file','args':{'file_path':'skills/'+candidates[0].parent.name+'/SKILL.md'}}]
            elif len(results)==(2 if re.search(r'已有技能包：([^。]+)',text) and re.search(r'已有技能包：([^。]+)',text).group(1).strip() else 1):
                calls=[{'id':action+'-output','name':'write_file','args':{'file_path':path,'content':json.dumps({'columns':['对象','数值'],'rows':[['隔离验证',42]],'metrics':[{'label':'测试值','value':42,'unit':''}],'items':[{'title':'隔离验证结果','status':'待确认','checked':True,'detail':'已读取原专家技能。确定性测试模型。'}]},ensure_ascii=False) if path.endswith('.json') else '# 隔离验证结果\n\n已使用原专家技能。确定性测试模型，不是真实模型验收。'}}]
        message=AIMessage(content='' if calls else '已完成本轮隔离验证。',tool_calls=calls)
        return ChatResult(generations=[ChatGeneration(message=message)])
