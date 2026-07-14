import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import SoloPlay from "./pages/SoloPlay";
import RoomCreate from "./pages/RoomCreate";
import RoomHost from "./pages/RoomHost";
import RoomJoin from "./pages/RoomJoin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/solo/:theme" element={<SoloPlay />} />
        <Route path="/host" element={<RoomCreate />} />
        <Route path="/host/:code" element={<RoomHost />} />
        <Route path="/join" element={<RoomJoin />} />
        <Route path="/join/:code" element={<RoomJoin />} />
      </Routes>
    </BrowserRouter>
  );
}
