import { Router, Routes, Route } from "@solidjs/router";
import "./App.css";
import RandomContentPage from "./pages/RandomContentPage";

function HomePage() {
  return (
    <main class="container">
      <h1>Welcome to Random Content Generator</h1>
      <div class="navigation-buttons">
        <a href="/page/1" class="nav-button">1</a>
        <a href="/page/2" class="nav-button">2</a>
        <a href="/page/3" class="nav-button">3</a>
      </div>
    </main>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" component={HomePage} />
        <Route path="/page/:id" component={RandomContentPage} />
      </Routes>
    </Router>
  );
}

export default App;
