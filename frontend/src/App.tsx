import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import WalletContextProvider from './WalletProvider';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { GamesProvider } from './contexts/GamesContext';
import { NetworkProvider } from './contexts/NetworkContext';
import Layout from './components/Layout';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import IdiotChessPage from './pages/IdiotChessPage';
import GameDispatcher from './pages/GameDispatcher';
import GreatBanyanPage from './pages/GreatBanyanPage';
import AboutPage from './pages/AboutPage';
import { StatsPage } from './pages/StatsPage';
import DemoPage from './pages/DemoPage';
import CrankPage from './pages/CrankPage';

function App() {
    return (
        <ThemeProvider>
            <NetworkProvider>
                <WalletContextProvider>
                    <ToastProvider>
                        <GamesProvider>
                            <Router>
                                <Layout>
                                    <Routes>
                                        <Route path="/" element={<Navigate to="/lobby" replace />} />
                                        <Route path="/lobby" element={<LobbyPage />} />
                                        <Route path="/rps-lobby" element={<LobbyPage />} />
                                        <Route path="/idiot-chess-lobby" element={<LobbyPage />} />
                                        <Route path="/game/:gameId" element={<GameDispatcher />} />
                                        <Route path="/rps-game/:gameId" element={<GamePage />} />
                                        <Route path="/idiot-chess" element={<IdiotChessPage />} />
                                        <Route path="/chess-game/:gameId" element={<IdiotChessPage mode="live" />} />
                                        <Route path="/great-banyan" element={<GreatBanyanPage />} />
                                        <Route path="/about" element={<AboutPage />} />
                                        <Route path="/stats" element={<StatsPage />} />
                                        <Route path="/demo" element={<DemoPage />} />
                                        <Route path="/crank" element={<CrankPage />} />
                                    </Routes>

                                </Layout>
                            </Router>
                        </GamesProvider>
                    </ToastProvider>
                </WalletContextProvider>
            </NetworkProvider>
        </ThemeProvider>
    );
}

export default App;