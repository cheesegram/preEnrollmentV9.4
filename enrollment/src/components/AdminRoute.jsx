import { Navigate, Outlet, useLocation } from "react-router-dom";

function AdminRoute() {
    const location = useLocation();

    const devBypassEnabled =
        import.meta.env.DEV &&
        import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

    // Temporary development-only bypass
    if (devBypassEnabled) {
        return <Outlet />;
    }

    const token = window.localStorage.getItem("token");
    const storedUser = window.localStorage.getItem("adminUser");

    if (!token || !storedUser) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location }}
            />
        );
    }

    try {
        const user = JSON.parse(storedUser);
        const role = String(user?.role ?? "").toLowerCase();

        if (role !== "admin" && role !== "administrator") {
            window.localStorage.removeItem("token");
            window.localStorage.removeItem("adminUser");

            return <Navigate to="/login" replace />;
        }
    } catch {
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("adminUser");

        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}

export default AdminRoute;