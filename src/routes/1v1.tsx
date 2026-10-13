import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/1v1")({
  component: () => <Outlet />,
});
