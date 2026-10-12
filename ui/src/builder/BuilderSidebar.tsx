import { Button, Dropdown } from "antd";
import {
  MoreHorizontal,
  LayoutTemplate,
  Grid2X2,
  Blocks,
  Cable,
  Sparkles,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAgent } from "../context/AgentContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import AvatarDropdown from "../components/AvatarDropdown";
import { CHAT_HISTORY_RAIL_ID, isChatPath } from "../layouts/chatHistoryRail";
import { PROJECT_MARKER, startAgent } from "./api";
import { message } from "../utils/antdMessage";
import "./builder.css";
import "./studio.css";

export default function BuilderSidebar() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { agents, refresh, setActiveAgent } = useAgent();
  const user = useCurrentUser();
  const onChat = isChatPath(pathname);
  return (
    <aside className="studio-sidebar" aria-label="应用与对话">
      <button className="studio-brand" onClick={() => navigate("/builder")}>
        <span className="studio-brand-mark">
          <Blocks size={18} />
        </span>
        <span>
          万象 Builder<small>APPLICATION STUDIO</small>
        </span>
      </button>
      <button
        className={
          "studio-nav-item " +
          (pathname === "/builder" && !search ? "active" : "")
        }
        onClick={() => navigate("/builder")}
      >
        <LayoutTemplate size={17} />
        应用库
      </button>
      <button
        className={
          "studio-nav-item " +
          (search.includes("view=apps") || onChat ? "active" : "")
        }
        onClick={() => navigate("/builder?view=apps")}
      >
        <Grid2X2 size={17} />
        我的应用
        <small>
          {
            agents.filter((a) => a.description?.startsWith(PROJECT_MARKER))
              .length
          }
        </small>
      </button>
      <div className="studio-sidebar-label">工作区</div>
      <div
        className="builder-chat-rail"
        id={CHAT_HISTORY_RAIL_ID}
        style={onChat ? undefined : { display: "none" }}
      />
      {!onChat && (
        <div className="builder-project-links">
          {agents
            .filter((a) => a.description?.startsWith(PROJECT_MARKER))
            .map((a) => (
              <button
                key={a.agent_id}
                onClick={async () => {
                  try {
                    if (a.state !== "running") await startAgent(a.agent_id);
                    await refresh();
                    setActiveAgent(a.agent_id);
                    navigate("/chat/" + a.agent_id);
                  } catch (error) {
                    message.error(String(error));
                  }
                }}
              >
                {a.name}
              </button>
            ))}
        </div>
      )}
      <button
        className="studio-nav-item"
        onClick={() => navigate("/connectors")}
      >
        <Cable size={16} />
        连接器
      </button>
      <button
        className="studio-nav-item"
        onClick={() => navigate("/builder/skills")}
      >
        <Sparkles size={16} />
        技能
      </button>
      <footer className="studio-sidebar-footer">
        <AvatarDropdown user={user} placement="sidebar" />
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "/connectors", label: "连接器" },
              { key: "/builder/skills", label: "技能" },
              { key: "/applications", label: "版本与交付" },
              { type: "divider" },
              { key: "/admin/models", label: "模型" },
              { key: "/boxes", label: "连接与账号" },
            ],
            onClick: ({ key }) => navigate(key),
          }}
        >
          <Button
            type="text"
            aria-label="更多能力"
            icon={<MoreHorizontal size={18} />}
          />
        </Dropdown>
      </footer>
    </aside>
  );
}

export function ApplicationSidebar({
  product,
}: {
  product: import("./api").Product;
}) {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const onChat = isChatPath(useLocation().pathname);
  const dependencies = product.definition?.dependencies;
  return (
    <aside className="builder-sidebar" aria-label="应用与对话">
      <button className="builder-brand" onClick={() => navigate("/builder")}>
        {product.name}
      </button>
      <div
        className="builder-chat-rail"
        id={CHAT_HISTORY_RAIL_ID}
        style={onChat ? undefined : { display: "none" }}
      />
      <footer>
        <AvatarDropdown user={user} placement="sidebar" />
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              ...(dependencies?.connectors.length
                ? [{ key: "/connectors", label: "连接器" }]
                : []),
              ...(dependencies?.skillPackages.length
                ? [{ key: "/builder/skills", label: "技能" }]
                : []),
              { key: "/admin/models", label: "模型" },
              { key: "/boxes", label: "连接与账号" },
            ],
            onClick: ({ key }) => navigate(key),
          }}
        >
          <Button
            type="text"
            aria-label="应用设置"
            icon={<MoreHorizontal size={18} />}
          />
        </Dropdown>
      </footer>
    </aside>
  );
}
