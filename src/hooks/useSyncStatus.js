// src/hooks/useSyncStatus.js
import { useState, useEffect, useCallback, useMemo } from "react";

/**
 * Hook: useSyncStatus
 * Handles health, sync, and block height polling for CAP.
 * Returns { healthOnline, capBlock, cardanoBlock, syncStatus, refreshAll }
 */
export default function useSyncStatus(authFetch) {
    if (!authFetch) {
        console.warn("Sync info fetch failed: user not logged");
    }
    const [healthOnline, setHealthOnline] = useState(null); // null | true | false
    const [capBlock, setCapBlock] = useState(null);
    const [cardanoBlock, setCardanoBlock] = useState(null);

    // --- Health check --------------------------------------------------------
    const checkHealth = useCallback(async () => {
        try {
            const res = await authFetch("/api/v1/nl/health");
            const data = await res.json();
            setHealthOnline(data?.status === "healthy");
        } catch {
            setHealthOnline(false);
        }
    }, [authFetch]);

    // --- Sync info (Cardano vs CAP) -----------------------------------------
    const fetchSyncInfo = useCallback(async () => {
        try {
            const sparqlQuery = `
      PREFIX blockchain: <http://www.mobr.ai/ontologies/blockchain#>
      PREFIX cardano:   <http://www.mobr.ai/ontologies/cardano#>
      SELECT ?currentCardanoHeight (MAX(?blockNum) AS ?capBlockNum)
      WHERE {
        cardano:Cardano blockchain:hasCurrentBlockHeight ?currentCardanoHeight .
        ?block a blockchain:Block .
        ?block cardano:hasBlockNumber ?blockNum .
      }
      GROUP BY (?currentCardanoHeight)
    `;

            const res = await authFetch("/api/v1/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: sparqlQuery, type: "SELECT" }),
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

            const data = await res.json();
            const row = data?.results?.results?.bindings?.[0];

            const capStr = row?.capBlockNum?.value;
            const chainStr = row?.currentCardanoHeight?.value;

            // Parse carefully; only reject NaN (don’t use truthiness)
            const cap = capStr !== undefined ? Number(capStr) : null;
            const chain = chainStr !== undefined ? Number(chainStr) : null;

            if (cap !== null && !Number.isNaN(cap)) setCapBlock(cap);
            if (chain !== null && !Number.isNaN(chain)) setCardanoBlock(chain);
        } catch (e) {
            console.warn("Sync info fetch failed:", e.message);
        }
    }, [authFetch]);

    // --- Derived sync status -------------------------------------------------
    const syncStatus = useMemo(() => {
        if (capBlock == null && cardanoBlock == null)
            return { text: "Unknown", cls: "" };
        if (capBlock == null || cardanoBlock == null)
            return { text: "Checking...", cls: "" };
        if (cardanoBlock - capBlock <= 5) return { text: "Synced", cls: "synced" };

        const pct = Math.max(
            0,
            Math.min(100, Math.round((capBlock / Math.max(1, cardanoBlock)) * 100))
        );
        return { text: `Syncing (${pct}%)`, cls: "syncing" };
    }, [capBlock, cardanoBlock]);

    // --- Public refresher ----------------------------------------------------
    const refreshAll = useCallback(() => {
        checkHealth();
        fetchSyncInfo();
    }, [checkHealth, fetchSyncInfo]);

    // --- Lifecycle polling ---------------------------------------------------
    useEffect(() => {
        if (!authFetch) return;

        refreshAll();

        const h = setInterval(checkHealth, 30_000);
        const s = setInterval(fetchSyncInfo, 60_000);
        return () => {
            clearInterval(h);
            clearInterval(s);
        };
    }, [refreshAll, checkHealth, fetchSyncInfo]);

    return { healthOnline, capBlock, cardanoBlock, syncStatus, refreshAll };
}
