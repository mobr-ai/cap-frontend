// src/components/admin/AdminTabs.jsx
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export function AdminTabs({ activeTab, onChange, t }) {
  const tabs = useMemo(
    () => [
      { key: "overview", label: t("admin.tabOverview") },
      { key: "users", label: t("admin.tabUsers") },
      { key: "system", label: t("admin.tabSystem") },
      { key: "alerts", label: t("admin.tabAlerts") },
    ],
    [t]
  );

  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const recalcIndicator = () => {
    const el = btnRefs.current[activeTab];
    const container = containerRef.current;
    if (!el || !container) return;

    const cRect = container.getBoundingClientRect();
    const bRect = el.getBoundingClientRect();

    setIndicator({
      left: bRect.left - cRect.left,
      width: bRect.width,
    });
  };

  // Position pill when active tab changes
  useLayoutEffect(() => {
    recalcIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabs]);

  // Recalculate on resize / font load
  useEffect(() => {
    window.addEventListener("resize", recalcIndicator);
    return () => window.removeEventListener("resize", recalcIndicator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      className="admin-tabs admin-tabs--animated"
      data-swipe-tabs-disabled="true"
    >
      <span
        className="admin-tab-indicator"
        style={{
          width: `${indicator.width}px`,
          transform: `translateX(${indicator.left}px)`,
        }}
        aria-hidden="true"
      />

      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          ref={(node) => {
            if (node) btnRefs.current[tab.key] = node;
          }}
          className={
            activeTab === tab.key ? "admin-tab admin-tab--active" : "admin-tab"
          }
          onClick={() => onChange(tab.key)}
          onPointerDown={(e) => {
            // Immediate visual feedback on mobile tap
            if (e.pointerType !== "mouse") {
              onChange(tab.key);
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
