// src/components/wallet/SolanaWalletLogin.jsx
import { useEffect, useMemo, useRef } from "react";
import Button from "react-bootstrap/Button";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import "../styles/AuthPage.css";

function truncateKey(value, left = 4, right = 4) {
  if (!value || value.length <= left + right + 3) return value || "";
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export default function SolanaWalletLogin({ showToast, disabled = false }) {
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  const prevConnectedRef = useRef(false);

  const address = useMemo(() => publicKey?.toBase58() || "", [publicKey]);
  const walletName = wallet?.adapter?.name || "Solana wallet";

  useEffect(() => {
    if (!prevConnectedRef.current && connected && address) {
      showToast?.(`Connected: ${truncateKey(address, 6, 6)}`, "success");
    }

    if (prevConnectedRef.current && !connected) {
      showToast?.("Wallet disconnected", "secondary");
    }

    prevConnectedRef.current = connected;
  }, [connected, address, showToast]);

  const handleConnectClick = () => {
    if (disabled || connecting) return;
    setVisible(true);
  };

  const handleDisconnectClick = async () => {
    try {
      await disconnect();
    } catch {
      showToast?.("Failed to disconnect wallet", "danger");
    }
  };

  return (
    <div className="Auth-oauth-wallets">
      {!connected ? (
        <Button
          className="Auth-oauth-button"
          variant="outline-secondary"
          size="md"
          onClick={handleConnectClick}
          disabled={disabled || connecting}
        >
          <span className="Auth-oauth-logo" aria-hidden="true">
            ◎
          </span>
          {connecting ? "Connecting wallet..." : "Connect Solana Wallet"}
        </Button>
      ) : (
        <>
          <Button
            className="Auth-oauth-button"
            variant="outline-secondary"
            size="md"
            disabled
          >
            <span className="Auth-oauth-logo" aria-hidden="true">
              ◎
            </span>
            {`${walletName}: ${truncateKey(address, 6, 6)}`}
          </Button>

          <Button
            className="Auth-oauth-button"
            variant="outline-secondary"
            size="md"
            onClick={handleDisconnectClick}
            disabled={disabled}
          >
            <span className="Auth-oauth-logo" aria-hidden="true">
              ◎
            </span>
            Disconnect Wallet
          </Button>
        </>
      )}
    </div>
  );
}
