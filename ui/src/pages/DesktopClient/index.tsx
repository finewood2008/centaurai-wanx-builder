import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, Button, Form, Input, Modal, Space, Tag } from "antd";
import { Radio, RefreshCw, Server, ArrowRight, Blocks } from "lucide-react";
import { LayoutTemplate, Grid2X2, Cable } from "lucide-react";
import { useLocation } from "react-router-dom";
import StandardLibrary, {
  STANDARD_PENDING,
} from "../../builder/StandardLibrary";
import { CurrentUserProvider } from "../../hooks/useCurrentUser";
import { AgentProvider } from "../../context/AgentContext";
import { LayoutModeProvider } from "../../context/LayoutModeContext";
import { VoiceOutputProvider } from "../../context/VoiceOutputContext";
import { clearAuthToken, setActiveAgentId } from "../../api/request";
import { stopBoxSession } from "../../utils/boxConnection";
import { useProduct } from "../../builder/useProduct";
import type { DesktopClientState, LanService } from "../../utils/desktopClient";
import "./connection.css";
const MainLayout = lazy(() => import("../../layouts/MainLayout"));
const ClientContext = createContext<DesktopClientState | null>(null);
export function useDesktopClientState() {
  return useContext(ClientContext);
}
const messages: Record<string, string> = {
  INVALID_BOX_URL: "请输入局域网 IPv4 地址，例如 http://192.168.1.10:8088。",
  CONNECTION_REQUIRED: "请先通过右下角的“连接服务”选择 WANX。",
  WANX_AUTH_FAILED: "登录失败，请检查账号、密码与该应用的访问权限。",
  AUTH_FAILED: "登录失败，请检查账号、密码，并确认此 WANX 已注册该应用。",
  FORBIDDEN:
    "此账号尚未获得该应用的访问权限，或应用部署已停用。请联系此 WANX 的管理员。",
  APPLICATION_SCOPE_MISMATCH:
    "所选 WANX 尚未返回此应用的独立身份，请先完成应用注册。",
  APPLICATION_NOT_FOUND: "这个 WANX 尚未注册此应用，请先完成应用注册。",
  CLIENT_REQUEST_FAILED:
    "连接未成功，请检查服务状态、网络和 HTTPS 证书后重试。",
};
const explain = (error: unknown) => {
  const code = error instanceof Error ? error.message : String(error);
  return messages[code] || code;
};

export function DesktopClientBar() {
  const product = useProduct(),
    state = useDesktopClientState();
  const { pathname, search } = useLocation();
  if (product?.kind === "builder")
    return (
      <div className="studio-topbar">
        <strong>
          {pathname.startsWith("/chat")
            ? "应用配置工作台"
            : search.includes("view=apps")
            ? "我的应用"
            : pathname === "/builder"
            ? "应用库"
            : "工作区"}
        </strong>
        <div className="studio-topbar-right">
          <span>
            {state?.phase === "ready" ? (
              <>
                <i className="studio-connection-dot" />
                {state.box?.name?.replace(/^WANX · /, "")}
              </>
            ) : state?.phase === "reconnecting" ? (
              "连接中断，正在重连"
            ) : (
              "尚未连接"
            )}
          </span>
          {state?.phase === "reconnecting" && (
            <Button
              size="small"
              onClick={() =>
                void window.wanxDesktop!.action("connection.retry")
              }
            >
              重试连接
            </Button>
          )}
          <span>Builder {product.version}</span>
        </div>
      </div>
    );
  return (
    <div className="builder-connection-bar">
      <Space wrap>
        <strong>{product?.name || "万象 Builder"}</strong>
        <Tag
          color={
            state?.phase === "ready"
              ? "green"
              : state?.phase === "reconnecting"
              ? "orange"
              : "default"
          }
        >
          {state?.phase === "ready"
            ? "已连接"
            : state?.phase === "reconnecting"
            ? "连接中断，正在重连"
            : "未连接"}
        </Tag>
        {state?.phase === "reconnecting" && (
          <Button
            size="small"
            onClick={() => void window.wanxDesktop!.action("connection.retry")}
          >
            重试连接
          </Button>
        )}
        {state?.box && (
          <span>
            {state.box.name} · {state.box.mode.toUpperCase()}
          </span>
        )}
        {state?.user && (
          <span>{state.user.display_name || state.user.username}</span>
        )}
      </Space>
    </div>
  );
}
export function DesktopBoxesPage() {
  const state = useDesktopClientState();
  if (!state?.sessionId) return <ConnectionLogin />;
  return (
    <section className="builder-connection-info">
      <h1>当前连接</h1>
      <h3>{state.box?.name}</h3>
      <p>{state.box?.id}</p>
      <p>当前账号：{state.user?.display_name || state.user?.username}</p>
      <Button
        onClick={() => void window.wanxDesktop!.action("connection.disconnect")}
      >
        退出并选择其他服务
      </Button>
    </section>
  );
}
function ConnectionLogin() {
  const product = useProduct(),
    state = useDesktopClientState();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [form] = Form.useForm();
  const endpoint = state?.selected?.endpoint;
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    form.resetFields(["password"]);
    if (endpoint)
      void window
        .wanxDesktop!.action<{ provider: string }>("connection.captcha")
        .then((config) => {
          if (!active) return;
          if (["slider", "none"].includes(config.provider)) setReady(true);
          else
            setError(
              "所选服务启用了第三方验证码，当前桌面连接页尚不支持该验证方式。",
            );
        })
        .catch((e) => {
          if (active) setError(explain(e));
        });
    return () => {
      active = false;
    };
  }, [endpoint, attempt, form]);
  async function login(values: { username: string; password: string }) {
    setBusy(true);
    setError("");
    try {
      await window.wanxDesktop!.action("connection.login", {
        username: values.username.trim(),
        password: values.password,
      });
      form.resetFields(["password"]);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="builder-login">
      <section className="builder-login-story">
        <div className="builder-login-brand">
          <Blocks size={26} />
          <span>{product?.name || "万象 Builder"}</span>
        </div>
        <div>
          <span className="builder-login-eyebrow">
            YOUR IDEAS, YOUR APPLICATIONS
          </span>
          <h1>
            {product?.kind === "application" ? (
              product.name
            ) : (
              <>
                让你的想法，
                <br />
                成为自己的应用。
              </>
            )}
          </h1>
          <p>
            {product?.kind === "application"
              ? product.definition?.description
              : "从一次对话开始，与构建专家一起理清需求、完善方案，让应用逐步成形。"}
          </p>
          <div className="builder-login-modes">
            <span>
              Ask <small>讨论想法</small>
            </span>
            <span>
              Plan <small>完善方案</small>
            </span>
            <span>
              Craft <small>构建与试用</small>
            </span>
          </div>
        </div>
        <small>Powered by WANX</small>
      </section>
      <section className="builder-login-panel">
        <div className="builder-login-form">
          <span className="builder-login-eyebrow">欢迎回来</span>
          <h2>进入你的工作空间</h2>
          <p>
            {endpoint ? (
              <>
                连接至 <strong>{state?.selected?.name}</strong>
              </>
            ) : (
              "先选择你的万象服务，再使用盒子账号登录。"
            )}
          </p>
          <Form
            form={form}
            layout="vertical"
            onFinish={login}
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: "请输入账号" }]}
            >
              <Input
                autoComplete="username"
                placeholder="你的 WANX 账号"
                size="large"
                disabled={busy}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                autoComplete="current-password"
                placeholder="输入密码"
                size="large"
                disabled={busy}
              />
            </Form.Item>
            {error && <Alert type="error" message={error} showIcon />}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={busy}
              disabled={!ready}
              icon={<ArrowRight size={17} />}
            >
              登录
            </Button>
          </Form>
          {endpoint && !ready && (
            <Button type="text" onClick={() => setAttempt((x) => x + 1)}>
              重新检查连接
            </Button>
          )}
          <p className="builder-login-footnote">
            {endpoint || "在右下角“连接服务”中搜索局域网里的 WANX。"}
          </p>
        </div>
        <Button
          className="builder-connect-launch"
          icon={<Radio size={17} />}
          onClick={() => setOpen(true)}
          disabled={busy}
        >
          连接服务
        </Button>
      </section>
      <ServicePicker open={open} onClose={() => setOpen(false)} />
    </main>
  );
}

function TemplateEntry() {
  const product = useProduct();
  const [loginOpen, setLoginOpen] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);
  return (
    <div className="studio-offline-shell">
      <aside className="studio-sidebar" aria-label="模板工作室导航">
        <div className="studio-brand">
          <span className="studio-brand-mark">
            <Blocks size={18} />
          </span>
          <span>
            万象 Builder<small>APPLICATION STUDIO</small>
          </span>
        </div>
        <button
          className="studio-nav-item active"
          onClick={() => {
            sessionStorage.removeItem(STANDARD_PENDING);
            setLibraryKey((k) => k + 1);
          }}
        >
          <LayoutTemplate size={17} />
          应用库
        </button>
        <button className="studio-nav-item" onClick={() => setLoginOpen(true)}>
          <Grid2X2 size={17} />
          我的应用
        </button>
        <div className="studio-offline-note">
          <b>先看看，再开始。</b>
          选择应用、调整配置。连接你的万象后，继续试用和安装。
        </div>
        <button className="studio-nav-item" onClick={() => setLoginOpen(true)}>
          <Cable size={16} />
          连接万象
        </button>
      </aside>
      <div className="studio-offline-main">
        <div className="studio-topbar">
          <strong>应用库</strong>
          <div className="studio-topbar-right">
            <span>Builder {product?.version}</span>
            <Button size="small" onClick={() => setLoginOpen(true)}>
              连接万象
            </Button>
          </div>
        </div>
        <div className="studio-home">
          <StandardLibrary
            key={libraryKey}
            connected={false}
            onUse={(_app, config) => {
              sessionStorage.setItem(STANDARD_PENDING, JSON.stringify(config));
              setLoginOpen(true);
            }}
          />
        </div>
      </div>
      <Modal
        className="studio-login-modal"
        open={loginOpen}
        onCancel={() => setLoginOpen(false)}
        footer={null}
        width={440}
        centered
        destroyOnClose
      >
        <ConnectionLogin />
      </Modal>
    </div>
  );
}
function ServicePicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const state = useDesktopClientState();
  const [services, setServices] = useState<LanService[]>([]),
    [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function search() {
    setSearching(true);
    setError("");
    try {
      const result = await window.wanxDesktop!.action<{
        services: LanService[];
      }>("connection.search");
      setServices(result.services);
      setSearched(true);
    } catch (e) {
      setError(explain(e));
    } finally {
      setSearching(false);
    }
  }
  async function select(endpoint: string) {
    setBusy(endpoint);
    setError("");
    try {
      await window.wanxDesktop!.action("connection.select", {
        address: endpoint,
      });
      onClose();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      open={open}
      onCancel={busy ? undefined : onClose}
      closable={!busy}
      maskClosable={!busy}
      footer={null}
      title="连接万象 WANX"
      width={620}
    >
      <p>搜索这台电脑所在局域网中的服务，选择后使用目标盒子的账号登录。</p>
      {state?.selected && (
        <div className="builder-service-current">
          <Server size={20} />
          <div>
            <small>当前服务</small>
            <strong>{state.selected.name}</strong>
            <span>{state.selected.endpoint}</span>
          </div>
        </div>
      )}
      <div className="builder-service-heading">
        <h3>局域网里的服务</h3>
        <Button
          icon={<RefreshCw size={15} />}
          loading={searching}
          disabled={!!busy}
          onClick={() => void search()}
        >
          搜索 WANX
        </Button>
      </div>
      <div className="builder-service-list" aria-live="polite">
        {services.map((s) => (
          <div className="builder-service" key={s.endpoint}>
            <div>
              <strong>{s.name}</strong>
              <span>{s.endpoint}</span>
              <small>
                {s.version ? `v${s.version} · ` : ""}
                {s.transport?.toUpperCase()}
              </small>
            </div>
            <Button
              type="primary"
              loading={busy === s.endpoint}
              disabled={!!busy}
              onClick={() => void select(s.endpoint)}
            >
              选择并登录
            </Button>
          </div>
        ))}
        {searched && !services.length && (
          <p>暂未发现服务。请检查网络，或在下方输入地址。</p>
        )}
      </div>
      <Form layout="vertical" onFinish={() => void select(address.trim())}>
        <Form.Item label="手动输入地址" htmlFor="builder-wanx-address">
          <Input
            id="builder-wanx-address"
            type="url"
            placeholder="http://192.168.1.10:8088"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!!busy}
          />
        </Form.Item>
        <Button
          htmlType="submit"
          disabled={!address.trim() || !!busy}
          loading={busy === address.trim() && !!busy}
        >
          连接
        </Button>
      </Form>
      <p className="builder-login-footnote">
        HTTP 连接适用于你信任的局域网；服务支持时可使用 HTTPS。
      </p>
      {error && <Alert type="error" message={error} showIcon />}
    </Modal>
  );
}
export default function DesktopClient() {
  const product = useProduct();
  const [state, setState] = useState<DesktopClientState | null>(null),
    [user, setUser] = useState<DesktopClientState["user"]>(null);
  const sessionRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const accept = (value: DesktopClientState) => {
      if (!active) return;
      setState(value);
      setUser(value.user);
      sessionRef.current = value.sessionId;
      if (!value.sessionId) {
        clearAuthToken();
        setActiveAgentId(null);
        localStorage.removeItem("octop:active-agent");
      }
    };
    void window.wanxDesktop!.action("state").then(accept);
    const unsubscribe = window.wanxDesktop!.subscribe((value) => {
      if (value.phase === "ready" && value.sessionId !== sessionRef.current) {
        window.location.assign("/builder");
        return;
      }
      if (!value.sessionId) stopBoxSession("switch");
      accept(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return (
    <ClientContext.Provider value={state}>
      {state?.sessionId ? (
        <CurrentUserProvider user={user} setUser={setUser}>
          <AgentProvider key={state.sessionId}>
            <LayoutModeProvider>
              <VoiceOutputProvider>
                <Suspense fallback={null}>
                  <MainLayout />
                </Suspense>
              </VoiceOutputProvider>
            </LayoutModeProvider>
          </AgentProvider>
        </CurrentUserProvider>
      ) : !product ? (
        <div
          className="studio-home"
          role="status"
          style={{ display: "grid", placeItems: "center" }}
        >
          正在打开应用工作台…
        </div>
      ) : product.kind === "builder" ? (
        <TemplateEntry />
      ) : (
        <ConnectionLogin />
      )}
    </ClientContext.Provider>
  );
}
