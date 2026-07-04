import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LotListPage from "@/pages/LotListPage";
import LotDetailPage from "@/pages/LotDetailPage";
import ThankYouPage from "@/pages/ThankYouPage";
import { pixelPageView } from "@/lib/pixel";

const queryClient = new QueryClient();

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    pixelPageView();
  }, [location]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={LotListPage} />
        <Route path="/lote/:itemId" component={LotDetailPage} />
        <Route path="/obrigado" component={ThankYouPage} />
        <Route>
          <div className="min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Página não encontrada</p>
          </div>
        </Route>
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
