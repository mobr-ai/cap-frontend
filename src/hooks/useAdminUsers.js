// src/hooks/useAdminUsers.js
import { useEffect, useMemo, useState } from "react";

export function useAdminUsers(authFetch, showToast, t) {
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [search, setSearch] = useState("");

  const [sortField, setSortField] = useState("user_id");
  const [sortDirection, setSortDirection] = useState("asc"); // 'asc' | 'desc'

  const authReady = !!authFetch;

  const isUserAnonymized = (user) => {
    const hasDeletedPrefix =
      typeof user.username === "string" && user.username.startsWith("deleted_");
    return !user.email && hasDeletedPrefix;
  };

  // ---------- load users (only when auth ready + search changes) ----------

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function loadUsers() {
      setUsersLoading(true);
      setUsersError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        params.set("limit", "50");
        params.set("offset", "0");

        const res = await authFetch(
          `/api/v1/admin/users/?${params.toString()}`,
          { method: "GET" }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        setUsers(Array.isArray(data.items) ? data.items : []);
        setUserStats(data.stats || null);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setUsersError(err.message || "Failed to load users");
          if (showToast) {
            showToast(`${t("admin.toastLoadError")}: ${err.message}`, "danger");
          }
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
    // only react to auth becoming ready and search term changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, search]);

  // ---------- sorting ----------

  const handleSort = (field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDirection("asc");
      return field;
    });
  };

  const sortedUsers = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      if (!sortField) return 0;

      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === undefined || aVal === null) aVal = "";
      if (bVal === undefined || bVal === null) bVal = "";

      if (typeof aVal === "boolean") aVal = aVal ? 1 : 0;
      if (typeof bVal === "boolean") bVal = bVal ? 1 : 0;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return sortDirection === "asc" ? -1 : 1;
      if (aStr > bStr) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [users, sortField, sortDirection]);

  // ---------- actions: toggle admin ----------

  const toggleAdmin = async (user) => {
    if (!authFetch) return;
    const targetFlag = !user.is_admin;

    try {
      const res = await authFetch(`/api/v1/admin/users/${user.user_id}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: targetFlag }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const backendDetail = data?.detail ?? "";
        const msg = backendDetail || t("admin.toastActionError");
        showToast && showToast(msg, "danger");
        return;
      }

      const updated = data;

      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? updated : u))
      );

      setUserStats((prev) => {
        if (!prev) return prev;
        const delta = targetFlag ? 1 : -1;
        return {
          ...prev,
          total_admins: Math.max(0, (prev.total_admins || 0) + delta),
        };
      });

      showToast &&
        showToast(
          targetFlag
            ? t("admin.toastPromotedToAdmin")
            : t("admin.toastDemotedFromAdmin"),
          "success"
        );
    } catch (err) {
      console.error(err);
      showToast &&
        showToast(`${t("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  // ---------- actions: toggle confirmed ----------

  const toggleConfirmed = async (user) => {
    if (!authFetch) return;
    const targetFlag = !user.is_confirmed;

    try {
      const res = await authFetch(
        `/api/v1/admin/users/${user.user_id}/confirmed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_confirmed: targetFlag }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const backendDetail = data?.detail ?? "";
        const msg = backendDetail || t("admin.toastActionError");
        showToast && showToast(msg, "danger");
        return;
      }

      const updated = data;

      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? updated : u))
      );

      setUserStats((prev) => {
        if (!prev) return prev;
        const delta = targetFlag ? 1 : -1;
        return {
          ...prev,
          total_confirmed: Math.max(0, (prev.total_confirmed || 0) + delta),
        };
      });

      showToast &&
        showToast(
          targetFlag
            ? t("admin.toastMarkedConfirmed")
            : t("admin.toastMarkedUnconfirmed"),
          "success"
        );
    } catch (err) {
      console.error(err);
      showToast &&
        showToast(`${t("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  // ---------- actions: delete / anonymize ----------

  const deleteUser = async (user) => {
    if (!authFetch) return;

    const anonymized = isUserAnonymized(user);

    const confirmed = window.confirm(
      anonymized
        ? t("admin.confirmDeleteUserAnonymized", {
            email: user.username || user.user_id,
          })
        : t("admin.confirmDeleteUserOnce", {
            email: user.email || user.username || user.user_id,
          })
    );
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/v1/admin/users/${user.user_id}`, {
        method: "DELETE",
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore
      }

      if (!res.ok) {
        const backendDetail = data?.detail || "";
        const lowered = backendDetail.toLowerCase();

        if (lowered.includes("last remaining admin")) {
          showToast && showToast(t("admin.errorLastAdmin"), "danger");
          return;
        }

        if (lowered.includes("your own account deletion flow")) {
          showToast &&
            showToast(t("admin.errorCannotSelfDeleteHere"), "danger");
          return;
        }

        showToast &&
          showToast(backendDetail || t("admin.toastActionError"), "danger");
        return;
      }

      if (data && data.status === "anonymized" && data.user) {
        const newUser = data.user;

        setUserStats((prev) => {
          if (!prev) return prev;
          const adminDelta =
            (newUser.is_admin ? 1 : 0) - (user.is_admin ? 1 : 0);
          const confirmedDelta =
            (newUser.is_confirmed ? 1 : 0) - (user.is_confirmed ? 1 : 0);
          return {
            ...prev,
            total_admins: Math.max(0, (prev.total_admins || 0) + adminDelta),
            total_confirmed: Math.max(
              0,
              (prev.total_confirmed || 0) + confirmedDelta
            ),
          };
        });

        setUsers((prev) =>
          prev.map((u) => (u.user_id === user.user_id ? newUser : u))
        );

        showToast && showToast(t("admin.toastUserAnonymized"), "success");
        return;
      }

      if (data && data.status === "deleted") {
        setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));

        setUserStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            total_users: Math.max(0, (prev.total_users || 0) - 1),
            filtered_total: Math.max(0, (prev.filtered_total || 0) - 1),
            total_admins: (prev.total_admins || 0) - (user.is_admin ? 1 : 0),
            total_confirmed:
              (prev.total_confirmed || 0) - (user.is_confirmed ? 1 : 0),
          };
        });

        showToast && showToast(t("admin.toastDeletedUser"), "success");
        return;
      }

      // Fallback: assume deleted
      setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));
      setUserStats((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          total_users: Math.max(0, (prev.total_users || 0) - 1),
          filtered_total: Math.max(0, (prev.filtered_total || 0) - 1),
          total_admins: (prev.total_admins || 0) - (user.is_admin ? 1 : 0),
          total_confirmed:
            (prev.total_confirmed || 0) - (user.is_confirmed ? 1 : 0),
        };
      });
      showToast && showToast(t("admin.toastDeletedUser"), "success");
    } catch (err) {
      console.error(err);
      showToast &&
        showToast(`${t("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  // ---------- derived totals ----------

  const totalUsers = userStats?.total_users ?? users.length;
  const totalAdmins = userStats?.total_admins ?? 0;
  const totalConfirmed = userStats?.total_confirmed ?? 0;
  const filteredTotal = userStats?.filtered_total ?? users.length;
  const hasFilter = search.trim().length > 0;

  return {
    users,
    userStats,
    usersLoading,
    usersError,
    search,
    setSearch,
    sortField,
    sortDirection,
    handleSort,
    sortedUsers,
    totalUsers,
    totalAdmins,
    totalConfirmed,
    filteredTotal,
    hasFilter,
    isUserAnonymized,
    toggleAdmin,
    toggleConfirmed,
    deleteUser,
    setUsers,
    setUserStats,
  };
}
