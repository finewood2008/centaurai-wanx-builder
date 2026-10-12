import {useProduct} from '../../builder/useProduct';
import { useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useUpdateStatus } from "../../hooks/useUpdateStatus";
import styles from "./index.module.less";



export default function WorkbenchBrand({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const product=useProduct();
  const BRAND_NAME=product?.name||"万象 Builder";
  const BRAND_ENGLISH=product?.kind==='application'?"Powered by WANX":"WANX Builder";
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { status } = useUpdateStatus();

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${collapsed ? styles.collapsed : ""}`}
        aria-label={t("workbenchAbout.title")}
        aria-haspopup="dialog"
        title={t("workbenchAbout.title")}
        onClick={() => setOpen(true)}
      >
        <img src="/centaurai-mark.png" alt="" className={styles.mark} />
        {!collapsed && (
          <span className={styles.names}>
            <strong>{BRAND_NAME}</strong>
            <small aria-label={BRAND_ENGLISH}>
              {[...BRAND_ENGLISH].map((letter, index) => (
                <span key={index} aria-hidden="true">
                  {letter}
                </span>
              ))}
            </small>
          </span>
        )}
      </button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        centered
        width={440}
        className={styles.dialog}
        styles={{ mask: { backdropFilter: "blur(3px)" } }}
        title={
          <div className={styles.heading}>
            <img src="/centaurai-mark.png" alt="" />
            <div>
              <span className={styles.title}>{BRAND_NAME}</span>
              <p className={styles.english}>{BRAND_ENGLISH}</p>
            </div>
          </div>
        }
      >
        <p className={styles.purpose}>{t("workbenchAbout.purpose")}</p>
        <p className={styles.description}>{t("workbenchAbout.description")}</p>
        <dl className={styles.version}>
          <dt>{t("workbenchAbout.version")}</dt>
          <dd>
            {product?.version ? `v${product.version}` : status?.current_version ? `v${status.current_version}` : "—"}
          </dd>
        </dl>
        <footer className={styles.footer}>
          {t("workbenchAbout.producer")}
        </footer>
      </Modal>
    </>
  );
}
