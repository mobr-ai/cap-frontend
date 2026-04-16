// src/components/wallet/SolanaWalletLogin.jsx
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import Button from "react-bootstrap/Button";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import "../styles/AuthPage.css";

function truncateKey(value, left = 4, right = 4) {
  if (!value || value.length <= left + right + 3) return value || "";
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export default function SolanaWalletLogin({ showToast, disabled = false }) {
  const { t } = useTranslation();
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  const prevConnectedRef = useRef(false);

  const address = useMemo(() => publicKey?.toBase58() || "", [publicKey]);
  const walletName = wallet?.adapter?.name || t("wallet.solanaDefaultName");

  useEffect(() => {
    if (!prevConnectedRef.current && connected && address) {
      showToast?.(
        t("wallet.connectedToast", {
          address: truncateKey(address, 6, 6),
        }),
        "success",
      );
    }

    if (prevConnectedRef.current && !connected) {
      showToast?.(t("wallet.disconnectedToast"), "secondary");
    }

    prevConnectedRef.current = connected;
  }, [connected, address, showToast, t]);

  const handleConnectClick = () => {
    if (disabled || connecting) return;
    setVisible(true);
  };

  const handleDisconnectClick = async () => {
    try {
      await disconnect();
    } catch {
      showToast?.(t("wallet.disconnectError"), "danger");
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
          <img
            src="/icons/solana.png"
            alt={t("wallet.solanaDefaultName")}
            className="Auth-oauth-logo"
          />
          {connecting
            ? t("wallet.connecting")
            : t("wallet.connectSolanaWallet")}
        </Button>
      ) : (
        <>
          <Button
            className="Auth-oauth-button"
            variant="outline-secondary"
            size="md"
            disabled
          >
            <img
              src="/icons/solana.png"
              alt={t("wallet.solanaDefaultName")}
              className="Auth-oauth-logo"
            />
            {t("wallet.connectedLabel", {
              wallet: walletName,
              address: truncateKey(address, 6, 6),
            })}
          </Button>

          <Button
            className="Auth-oauth-button"
            variant="outline-secondary"
            size="md"
            onClick={handleDisconnectClick}
            disabled={disabled}
          >
            <img
              src="/icons/solana.png"
              alt={t("wallet.solanaDefaultName")}
              className="Auth-oauth-logo"
            />
            {t("wallet.disconnectWallet")}
          </Button>
        </>
      )}
    </div>
  );
}
