import { createFileRoute } from "@tanstack/react-router";
import { BallArenaPage } from "./index";

export const Route = createFileRoute("/1v1/admin")({
  component: () => <BallArenaPage mode="admin" />,
});
