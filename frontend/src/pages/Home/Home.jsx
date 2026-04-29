import HeroSection from "./HeroSection";
import FeaturedTrendingSection from "./FeaturedTrendingSection";
import FeaturesSection from "./FeaturesSection";
import AutomationSection from "./AutomationSection";
import "./home.css";

const Home = () => {
  return (
    <main className="home-page">
      <HeroSection />
      <FeaturedTrendingSection />
      <FeaturesSection />
      <AutomationSection />
    </main>
  );
};

export default Home;
