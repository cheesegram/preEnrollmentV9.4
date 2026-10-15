import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../lib/axios";

function Login() {
    const navigate = useNavigate();
    const location = useLocation();

    const [form, setForm] = useState({
        email: "",
        password: "",
    });

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        document.title = "Admin Login - IITI Enrollment System";

        const devBypassEnabled =
            import.meta.env.DEV &&
            import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

        if (devBypassEnabled) {
            window.localStorage.setItem(
                "adminUser",
                JSON.stringify({
                    name: "Administrator",
                    email: "admin@iiti.local",
                    role: "admin",
                })
            );
            window.localStorage.setItem("token", "dev-bypass-token");

            navigate("/", { replace: true });
            return;
        }

        const token = window.localStorage.getItem("token");
        const storedUser = window.localStorage.getItem("adminUser");

        if (!token || !storedUser) return;

        try {
            const user = JSON.parse(storedUser);
            const role = String(user?.role ?? "").toLowerCase();

            if (role === "admin" || role === "administrator") {
                navigate("/", { replace: true });
            }
        } catch {
            window.localStorage.removeItem("token");
            window.localStorage.removeItem("adminUser");
        }
    }, [navigate]);


    const handleChange = (event) => {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const email = form.email.trim();
        const password = form.password;

        if (!email || !password) {
            toast.error("Please enter your email and password.");
            return;
        }

        try {
            setLoading(true);

            const response = await api.post("/auth/admin/login", {
                email,
                password,
            });

            const token =
                response?.data?.token ??
                response?.data?.accessToken;

            const user =
                response?.data?.user ??
                response?.data?.admin;

            const role = String(user?.role ?? "").toLowerCase();

            if (!token) {
                throw new Error("No authentication token was returned.");
            }

            if (role !== "admin" && role !== "administrator") {
                toast.error("Only administrators can access this system.");
                return;
            }

            window.localStorage.setItem("token", token);
            window.localStorage.setItem("adminUser", JSON.stringify(user));

            toast.success("Welcome, Administrator.");

            const destination =
                location.state?.from?.pathname || "/";

            navigate(destination, {
                replace: true,
            });
        } catch (error) {
            console.error("Admin login failed:", error);

            const message =
                error?.response?.data?.message ||
                error?.message ||
                "Invalid administrator email or password.";

            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#f4f7f5]">
            <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
                <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-9">
                    <div className="mb-8 flex items-center gap-4 border-b border-slate-200 pb-6">
                        <div className="grid h-14 w-14 shrink-0 place-items-center">
                            <img
                                src="/iitilogo.png"
                                alt="IITI logo"
                                className="h-full w-full object-contain"
                            />
                        </div>

                        <div>
                          <p className="text-xl font-semibold text-[#173F30]">IITI</p>
                          <p className="mt-0.5 text-sm text-slate-600">Enrollment System</p>
                        </div>
                    </div>

                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                            Administrator Login
                        </h1>

                        <p className="mt-3 text-sm leading-6 text-slate-500">
                            Sign in using your administrator credentials to continue.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                        <div>
                            <label
                                htmlFor="email"
                                className="mb-2 block text-sm font-bold text-slate-700"
                            >
                                Email address
                            </label>

                            <div className="relative">
                                <i className="fa-regular fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="username"
                                    value={form.email}
                                    onChange={handleChange}
                                    placeholder="admin@iiti.edu.ph"
                                    disabled={loading}
                                    required
                                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="mb-2 block text-sm font-bold text-slate-700"
                            >
                                Password
                            </label>

                            <div className="relative">
                                <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={form.password}
                                    onChange={handleChange}
                                    placeholder="Enter your password"
                                    disabled={loading}
                                    required
                                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword((previous) => !previous)}
                                    disabled={loading}
                                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
                                    aria-pressed={showPassword}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    <i
                                        className={
                                            showPassword
                                                ? "fa-regular fa-eye-slash"
                                                : "fa-regular fa-eye"
                                        }
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 border-t border-slate-200 pt-4">
                            <i className="fa-solid fa-shield-halved mt-0.5 text-emerald-700" />

                            <p className="text-xs leading-5 text-[#315B46]">
                                This system is restricted to authorized IITI
                                administrators. All login attempts may be recorded.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#174C35] px-5 text-sm font-bold text-white transition hover:bg-[#103D2A] focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                        >
                            {loading ? (
                                <>
                                    <i className="fa-solid fa-circle-notch fa-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign in
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-7 text-center text-xs leading-5 text-slate-500">
                        Contact the system administrator if you cannot access your account.
                    </p>
                </section>
            </div>
        </main>
    );
}

export default Login;