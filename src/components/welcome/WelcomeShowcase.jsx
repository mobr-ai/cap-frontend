import React, { useMemo } from "react";

export default function WelcomeShowcase({ t, showcaseRef }) {
  const heroBadges = useMemo(
    () => [
      t("welcome.sap.hero.badges.0", "Grounded AI reasoning"),
      t("welcome.sap.hero.badges.1", "Ontology-backed insights"),
      t("welcome.sap.hero.badges.2", "Streaming analytics UX"),
    ],
    [t],
  );

  const leftFeatures = useMemo(
    () => [
      {
        eyebrow: t("welcome.sap.features.kg.eyebrow", "Semantic intelligence"),
        title: t(
          "welcome.sap.features.kg.title",
          "Ontology-Backed Knowledge Graph",
        ),
        desc: t(
          "welcome.sap.features.kg.desc",
          "Models Solana-specific constructs into a formal semantic layer that supports reusable analytics, explainable querying, and grounded AI outputs.",
        ),
      },
      {
        eyebrow: t("welcome.sap.features.etl.eyebrow", "Reliable ingestion"),
        title: t(
          "welcome.sap.features.etl.title",
          "Deterministic ETL Pipelines",
        ),
        desc: t(
          "welcome.sap.features.etl.desc",
          "Synchronizes raw on-chain activity into structured, queryable representations designed for downstream analytics, reasoning, and visualization.",
        ),
      },
      {
        eyebrow: t("welcome.sap.features.ai.eyebrow", "Ground truth first"),
        title: t(
          "welcome.sap.features.ai.title",
          "Hallucination-Resistant AI Reasoning",
        ),
        desc: t(
          "welcome.sap.features.ai.desc",
          "Uses the knowledge graph as a grounding layer so answers, charts, and summaries stay traceable to structured blockchain evidence.",
        ),
      },
    ],
    [t],
  );

  const rightFeatures = useMemo(
    () => [
      {
        eyebrow: t("welcome.sap.features.discovery.eyebrow", "Professional UX"),
        title: t(
          "welcome.sap.features.discovery.title",
          "Natural Language Discovery",
        ),
        desc: t(
          "welcome.sap.features.discovery.desc",
          "Enables complex blockchain investigations through plain-language prompts, guided follow-ups, and explainable results.",
        ),
      },
      {
        eyebrow: t("welcome.sap.features.dashboard.eyebrow", "Live monitoring"),
        title: t(
          "welcome.sap.features.dashboard.title",
          "Interactive Smart Dashboards",
        ),
        desc: t(
          "welcome.sap.features.dashboard.desc",
          "Generates user-defined charts and tables for real-time monitoring of token activity, program behavior, and ecosystem patterns.",
        ),
      },
      {
        eyebrow: t("welcome.sap.features.context.eyebrow", "Holistic analysis"),
        title: t(
          "welcome.sap.features.context.title",
          "On-Chain + Off-Chain Context",
        ),
        desc: t(
          "welcome.sap.features.context.desc",
          "Merges live network activity with semantic metadata and external context for deeper investigation and more meaningful insights.",
        ),
      },
    ],
    [t],
  );

  const coreNodes = useMemo(
    () => [
      t("welcome.sap.core.nodes.0", "Wallet intelligence"),
      t("welcome.sap.core.nodes.1", "Validator activity"),
      t("welcome.sap.core.nodes.2", "Transaction flows"),
      t("welcome.sap.core.nodes.3", "Semantic graph exploration"),
    ],
    [t],
  );

  const queryExamples = useMemo(
    () => [
      t(
        "welcome.sap.examples.0",
        "Show validator activity with the largest stake movement in the last 24 hours",
      ),
      t(
        "welcome.sap.examples.1",
        "Compare transaction flow patterns for the top Solana programs this week",
      ),
      t(
        "welcome.sap.examples.2",
        "Summarize token activity anomalies and explain what changed",
      ),
    ],
    [t],
  );

  const stackItems = useMemo(
    () => [
      {
        title: t("welcome.sap.stack.qlever.title", "QLever KG"),
        subtitle: t(
          "welcome.sap.stack.qlever.subtitle",
          "Knowledge graph engine",
        ),
        desc: t(
          "welcome.sap.stack.qlever.desc",
          "Processes large semantic datasets for grounded retrieval and explainable query execution.",
        ),
      },
      {
        title: t("welcome.sap.stack.triton.title", "Triton RPC"),
        subtitle: t(
          "welcome.sap.stack.triton.subtitle",
          "Blockchain data access",
        ),
        desc: t(
          "welcome.sap.stack.triton.desc",
          "Provides high-concurrency access to historical and live Solana ledger activity.",
        ),
      },
      {
        title: t("welcome.sap.stack.openai.title", "OpenAI API"),
        subtitle: t("welcome.sap.stack.openai.subtitle", "Reasoning layer"),
        desc: t(
          "welcome.sap.stack.openai.desc",
          "Transforms natural-language requests into grounded analyses, narratives, and artifacts.",
        ),
      },
    ],
    [t],
  );

  const handleScrollTop = () => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <main className="WelcomeShowcase" ref={showcaseRef}>
      <section className="WelcomeShowcase-shell WelcomeShowcase-shell--hero">
        <div className="WelcomeShowcase-inner">
          <div className="WelcomeShowcase-head" data-reveal>
            <div className="WelcomeShowcase-eyebrow">
              {t("welcome.sap.eyebrow", "SAP")}
            </div>

            <h2 className="WelcomeShowcase-title">
              {t(
                "welcome.sap.headline",
                "SAP: The Intelligence Layer for Solana",
              )}
            </h2>

            <p className="WelcomeShowcase-lead">
              {t(
                "welcome.sap.lead",
                "Empowering builders with grounded AI reasoning, semantic querying, and ontology-backed blockchain intelligence.",
              )}
            </p>

            <div className="WelcomeShowcase-badges" role="list">
              {heroBadges.map((item) => (
                <div
                  key={item}
                  className="WelcomeShowcase-badge"
                  role="listitem"
                >
                  <span className="WelcomeShowcase-badgeDot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="WelcomeShowcase-infographic" data-reveal>
            <div className="WelcomeShowcase-column WelcomeShowcase-column--left">
              {leftFeatures.map((item, index) => (
                <article
                  key={item.title}
                  className={`WelcomeFeatureCard WelcomeFeatureCard--left WelcomeFeatureCard--${index + 1}`}
                  data-reveal
                >
                  <div className="WelcomeFeatureCard-eyebrow">
                    {item.eyebrow}
                  </div>
                  <h3 className="WelcomeFeatureCard-title">{item.title}</h3>
                  <p className="WelcomeFeatureCard-desc">{item.desc}</p>
                </article>
              ))}
            </div>

            <div className="WelcomeShowcase-center" data-reveal>
              <div className="WelcomeCore">
                <div className="WelcomeCore-orbit WelcomeCore-orbit--outer" />
                <div className="WelcomeCore-orbit WelcomeCore-orbit--mid" />
                <div className="WelcomeCore-orbit WelcomeCore-orbit--inner" />

                <div className="WelcomeCore-node WelcomeCore-node--top">
                  {coreNodes[0]}
                </div>
                <div className="WelcomeCore-node WelcomeCore-node--right">
                  {coreNodes[1]}
                </div>
                <div className="WelcomeCore-node WelcomeCore-node--bottom">
                  {coreNodes[2]}
                </div>
                <div className="WelcomeCore-node WelcomeCore-node--left">
                  {coreNodes[3]}
                </div>

                <div className="WelcomeCore-stem WelcomeCore-stem--up" />
                <div className="WelcomeCore-stem WelcomeCore-stem--down" />
                <div className="WelcomeCore-stem WelcomeCore-stem--left" />
                <div className="WelcomeCore-stem WelcomeCore-stem--right" />

                <div className="WelcomeCore-center">
                  <div className="WelcomeCore-centerGlow" />
                  <div className="WelcomeCore-mark">
                    {t("welcome.sap.core.mark", "SAP")}
                  </div>
                </div>
              </div>
            </div>

            <div className="WelcomeShowcase-column WelcomeShowcase-column--right">
              {rightFeatures.map((item, index) => (
                <article
                  key={item.title}
                  className={`WelcomeFeatureCard WelcomeFeatureCard--right WelcomeFeatureCard--${index + 1}`}
                  data-reveal
                >
                  <div className="WelcomeFeatureCard-eyebrow">
                    {item.eyebrow}
                  </div>
                  <h3 className="WelcomeFeatureCard-title">{item.title}</h3>
                  <p className="WelcomeFeatureCard-desc">{item.desc}</p>

                  {index === 0 && (
                    <div className="WelcomeMiniPanel WelcomeMiniPanel--search">
                      <div className="WelcomeMiniPanel-bar">
                        <span className="WelcomeMiniPanel-dot" />
                        <span className="WelcomeMiniPanel-dot" />
                        <span className="WelcomeMiniPanel-dot" />
                      </div>
                      <div className="WelcomeMiniPanel-content">
                        <div className="WelcomeMiniPanel-label">
                          {t(
                            "welcome.sap.mini.discoveryLabel",
                            "Natural language discovery",
                          )}
                        </div>
                        <div className="WelcomeMiniPanel-input">
                          {t(
                            "welcome.sap.mini.discoveryPrompt",
                            "Search query...",
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {index === 1 && (
                    <div className="WelcomeMiniPanel WelcomeMiniPanel--chart">
                      <div className="WelcomeMiniPanel-bar">
                        <span className="WelcomeMiniPanel-dot" />
                        <span className="WelcomeMiniPanel-dot" />
                        <span className="WelcomeMiniPanel-dot" />
                      </div>
                      <div className="WelcomeChart">
                        <span className="WelcomeChart-line WelcomeChart-line--a" />
                        <span className="WelcomeChart-line WelcomeChart-line--b" />
                        <span className="WelcomeChart-line WelcomeChart-line--c" />
                      </div>
                    </div>
                  )}

                  {index === 2 && (
                    <div className="WelcomeMiniPanel WelcomeMiniPanel--context">
                      <div className="WelcomeMiniPanel-split">
                        <div className="WelcomeMiniPanel-tile">
                          {t("welcome.sap.mini.liveData", "Live Network Data")}
                        </div>
                        <div className="WelcomeMiniPanel-tile">
                          {t(
                            "welcome.sap.mini.externalContext",
                            "External Context",
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="WelcomeShowcase-shell WelcomeShowcase-shell--queries">
        <div className="WelcomeShowcase-inner">
          <div className="WelcomeQueries" data-reveal>
            <div className="WelcomeQueries-copy">
              <div className="WelcomeShowcase-sectionEyebrow">
                {t("welcome.sap.queries.eyebrow", "Query experience")}
              </div>
              <h3 className="WelcomeShowcase-sectionTitle">
                {t(
                  "welcome.sap.queries.title",
                  "Natural-language investigation, grounded by structure",
                )}
              </h3>
              <p className="WelcomeShowcase-sectionBody">
                {t(
                  "welcome.sap.queries.body",
                  "SAP turns conversational requests into structured semantic operations, returning explainable results that can be pinned, shared, and revisited.",
                )}
              </p>
            </div>

            <div className="WelcomeQueries-list">
              {queryExamples.map((item, index) => (
                <div
                  key={item}
                  className="WelcomeQueryChip"
                  data-reveal
                  style={{ transitionDelay: `${index * 60}ms` }}
                >
                  <span className="WelcomeQueryChip-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="WelcomeQueryChip-text">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="WelcomeShowcase-shell WelcomeShowcase-shell--stack">
        <div className="WelcomeShowcase-inner">
          <div className="WelcomeStack" data-reveal>
            <div className="WelcomeShowcase-sectionEyebrow">
              {t("welcome.sap.stack.eyebrow", "Technical service stack")}
            </div>

            <h3 className="WelcomeShowcase-sectionTitle">
              {t(
                "welcome.sap.stack.title",
                "Infrastructure designed for grounded analytics",
              )}
            </h3>

            <div className="WelcomeStack-grid">
              {stackItems.map((item, index) => (
                <article
                  key={item.title}
                  className="WelcomeStack-card"
                  data-reveal
                  style={{ transitionDelay: `${index * 80}ms` }}
                >
                  <div className="WelcomeStack-iconShell">
                    <div className="WelcomeStack-iconCore" />
                  </div>
                  <div className="WelcomeStack-cardTitle">{item.title}</div>
                  <div className="WelcomeStack-cardSubtitle">
                    {item.subtitle}
                  </div>
                  <p className="WelcomeStack-cardDesc">{item.desc}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="WelcomeCTA" data-reveal>
            <div className="WelcomeCTA-copy">
              <div className="WelcomeCTA-title">
                {t(
                  "welcome.sap.cta.title",
                  "Ready to explore Solana through a semantic intelligence layer?",
                )}
              </div>
              <div className="WelcomeCTA-desc">
                {t(
                  "welcome.sap.cta.desc",
                  "Sign in above to access your workspace and start building grounded analytics workflows.",
                )}
              </div>
            </div>

            <button
              type="button"
              className="WelcomeCTA-button"
              onClick={handleScrollTop}
            >
              {t("welcome.sap.cta.button", "Back to sign in")}
            </button>
          </div>
        </div>
      </section>

      <footer className="WelcomeFooter" data-reveal>
        <div className="WelcomeFooter-inner">
          <div className="WelcomeFooter-brand">
            <img
              className="WelcomeFooter-logo"
              src="/assets/mobr-footer-logo.png"
              alt={t("mobrLogoAlt", "MOBR Systems")}
              loading="lazy"
            />
            <div className="WelcomeFooter-tagline">
              {t(
                "welcome.footer.tagline",
                "Building advanced data and AI infrastructure for decentralized ecosystems.",
              )}
            </div>
          </div>

          <nav
            className="WelcomeFooter-links"
            aria-label={t("welcome.footer.linksAria", "Links")}
          >
            <a
              className="WelcomeFooter-link"
              href="https://mobr.ai"
              target="_blank"
              rel="noreferrer"
            >
              mobr.ai
            </a>
            <a
              className="WelcomeFooter-link"
              href="https://github.com/mobr-ai"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="WelcomeFooter-link"
              href="https://www.linkedin.com/company/mobr"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </nav>

          <div className="WelcomeFooter-fineprint">
            <span>© {new Date().getFullYear()} MOBR Systems</span>
            <span className="WelcomeFooter-sep" aria-hidden="true">
              ·
            </span>
            <span>{t("welcome.footer.allRights", "All rights reserved.")}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
