"use client";

import { useCallback, useMemo, useState } from "react";
import { GLOSSARY, GLOSSARY_GROUPS } from "@/lib/learn/glossary";
import { HORIZON_LABELS, HORIZON_TIMEFRAME, STRATEGY_CATALOG } from "@/lib/strategies/catalog";
import { ChatPanel } from "../chat/chat-panel";
import { useHermes } from "../chat/use-hermes";
import { Nav } from "../nav";

type Tab = "glossary" | "strategies";

export function Learn() {
  const [tab, setTab] = useState<Tab>("glossary");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  /**
   * The tutor gets the page rather than a run here: on the learning page the
   * subject is the vocabulary, not any particular backtest.
   */
  const context = useCallback(
    () =>
      [
        "CURRENT RUN",
        "Page: the learning page — a glossary of technical terms and the strategy catalog.",
        "No backtest is on screen. If the reader asks about specific numbers, offer to take",
        "them to the lab with a `go lab` action rather than inventing figures.",
        "",
        `Catalog: ${STRATEGY_CATALOG.length} strategies across four horizons.`,
      ].join("\n"),
    [],
  );

  const hermes = useHermes(context);

  const terms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GLOSSARY.filter(
      (entry) =>
        (group === null || entry.group === group) &&
        (needle === "" ||
          entry.term.toLowerCase().includes(needle) ||
          entry.short.toLowerCase().includes(needle)),
    );
  }, [query, group]);

  const byHorizon = useMemo(
    () =>
      (["daily", "swing", "position", "long"] as const).map((horizon) => ({
        horizon,
        strategies: STRATEGY_CATALOG.filter((strategy) => strategy.horizon === horizon),
      })),
    [],
  );

  const ask = (question: string) => void hermes.send(question);

  return (
    <main className="page learn-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ❯
          </span>
          <h1>LEARN</h1>
        </div>
        <Nav />
      </header>

      <div className="learn-grid">
        <section className="panel" aria-label="Reference">
          <header className="tabbar" role="tablist" aria-label="Reference views">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "glossary"}
              className={tab === "glossary" ? "tab active" : "tab"}
              onClick={() => setTab("glossary")}
            >
              GLOSSARY<span className="badge">{GLOSSARY.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "strategies"}
              className={tab === "strategies" ? "tab active" : "tab"}
              onClick={() => setTab("strategies")}
            >
              STRATEGIES<span className="badge">{STRATEGY_CATALOG.length}</span>
            </button>
          </header>

          <div className="panel-body">
            {tab === "glossary" ? (
              <>
                <div className="catalog-filter">
                  <div className="catalog-search">
                    <span className="search-glyph" aria-hidden="true">
                      ⌕
                    </span>
                    <input
                      aria-label="Search the glossary"
                      placeholder="Search terms"
                      value={query}
                      spellCheck={false}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <div className="family-chips" role="group" aria-label="Term group">
                    <button
                      type="button"
                      className={group === null ? "chip on" : "chip"}
                      aria-pressed={group === null}
                      onClick={() => setGroup(null)}
                    >
                      All
                    </button>
                    {GLOSSARY_GROUPS.map((entry) => (
                      <button
                        type="button"
                        key={entry}
                        className={group === entry ? "chip on" : "chip"}
                        aria-pressed={group === entry}
                        onClick={() => setGroup(group === entry ? null : entry)}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="glossary">
                  {terms.map((entry) => (
                    <article className="term" key={entry.term}>
                      <h2>
                        {entry.term}
                        <span className="term-group">{entry.group}</span>
                      </h2>
                      <p className="term-short">{entry.short}</p>
                      <p className="term-detail">{entry.detail}</p>
                      {entry.seenIn ? <p className="term-seen">Where you meet it: {entry.seenIn}</p> : null}
                      <button
                        type="button"
                        className="term-ask"
                        onClick={() => ask(`Explain ${entry.term} to me with a worked example.`)}
                      >
                        Ask Hermes for an example
                      </button>
                    </article>
                  ))}
                  {terms.length === 0 ? (
                    <p className="empty">
                      <span className="empty-glyph" aria-hidden="true">
                        ⌕
                      </span>
                      No term matches that. Ask Hermes instead — it answers beyond this list.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="glossary">
                {byHorizon.map(({ horizon, strategies }) => (
                  <section key={horizon}>
                    <h2 className="horizon-head">
                      {HORIZON_LABELS[horizon]}
                      <span className="term-group">{HORIZON_TIMEFRAME[horizon]} bars</span>
                    </h2>
                    {strategies.map((strategy) => (
                      <article className="term" key={strategy.id}>
                        <h2>
                          <span className="code">{strategy.code}</span> {strategy.name}
                          <span className="term-group">{strategy.family}</span>
                        </h2>
                        <p className="term-short">{strategy.description}</p>
                        <a
                          className="evidence-card"
                          href={strategy.evidence.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="evidence">↗ {strategy.evidence.title}</span>
                          <p>{strategy.evidence.note}</p>
                        </a>
                        <button
                          type="button"
                          className="term-ask"
                          onClick={() =>
                            ask(
                              `Explain how ${strategy.name} works, when it fails, and what its parameters do.`,
                            )
                          }
                        >
                          Ask Hermes about this rule
                        </button>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel learn-chat" aria-label="Hermes">
          <header className="panel-title">
            <span className="title-text">HERMES</span>
            <span className={`chat-state ${hermes.state}`}>
              <span className="dot" aria-hidden="true" />
              <span className="visually-hidden">Hermes is {hermes.state}</span>
            </span>
          </header>
          <ChatPanel
            turns={hermes.turns}
            streaming={hermes.streaming}
            state={hermes.state}
            onSend={hermes.send}
            onStop={hermes.stop}
            onCommand={(command) => {
              // The only actions that mean anything here are the ones that leave.
              const target = /^go\s+(\w+)/.exec(command)?.[1];
              window.location.href = target && target !== "learn" ? `/${target === "lab" ? "" : target}` : "/";
            }}
          />
          <form
            className="learn-ask"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
              if (input.value.trim()) {
                ask(input.value);
                input.value = "";
              }
            }}
          >
            <input
              name="q"
              aria-label="Ask Hermes"
              placeholder="Ask anything — terms, strategies, how to evaluate them"
              autoComplete="off"
            />
            <button type="submit">ASK ↵</button>
          </form>
        </section>
      </div>
    </main>
  );
}
