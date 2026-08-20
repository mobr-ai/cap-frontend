// Historical CAP closed-beta links now lead to public signup.
import { Navigate } from "react-router-dom";

export default function BetaProgramPage() {
  return <Navigate to="/signup" replace />;
}
