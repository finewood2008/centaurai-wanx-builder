import PageShell from "../layouts/PageShell";
import SkillsTabs from "../pages/Agent/Skills/components/SkillsTabs";
import { useAgent } from "../context/AgentContext";
export default function BuilderSkills() {
  const { activeAgentId } = useAgent();
  return (
    <PageShell
      title="技能"
      subtitle="为当前应用补充需要的能力"
      agentScoped
      fill
    >
      <SkillsTabs agentId={activeAgentId} />
    </PageShell>
  );
}
