import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineStar, HiOutlineTrendingUp, HiOutlineSparkles } from "react-icons/hi";
import { listPublicBusinesses } from "../../api/businesses";
import { getApiErrorMessage } from "../../api/auth";
import { resolveMediaUrl } from "../../utils/assets";
import { useCategories } from "../../hooks/useCategories";
import { CategoryGlyph } from "../../utils/categoryIcons";

const MAX_FEATURED = 6;
const MAX_TRENDING = 8;

function FeaturedCard({ business, categoryLabel, badge }) {
  const img = resolveMediaUrl(business.image);
  const slug = business.slug || business.id;

  return (
    <Link
      to={`/book/${slug}`}
      className="home-ft-card"
    >
      <div className="home-ft-card__media">
        {img ? (
          <img src={img} alt="" className="home-ft-card__img" loading="lazy" />
        ) : (
          <div className="home-ft-card__placeholder" aria-hidden>
            <CategoryGlyph
              iconKey={
                categoryLabel?.iconKey ||
                business.category ||
                "other"
              }
              size={32}
            />
          </div>
        )}
        {badge ? (
          <span className={`home-ft-card__badge home-ft-card__badge--${badge}`}>
            {badge === "featured" ? (
              <>
                <HiOutlineSparkles size={13} strokeWidth={2} />
                Featured
              </>
            ) : (
              <>
                <HiOutlineTrendingUp size={13} strokeWidth={2} />
                Trending
              </>
            )}
          </span>
        ) : null}
      </div>
      <div className="home-ft-card__body">
        <h3 className="home-ft-card__title">{business.name}</h3>
        <p className="home-ft-card__meta">
          <span className="home-ft-card__cat">{categoryLabel?.name || business.category}</span>
          <span className="home-ft-card__dot" aria-hidden>
            ·
          </span>
          <span className="home-ft-card__rating">
            <HiOutlineStar size={14} className="home-ft-card__star" />
            {Number(business.rating ?? 0).toFixed(1)}
            <span className="home-ft-card__rcount">
              ({business.reviewCount ?? 0})
            </span>
          </span>
        </p>
      </div>
    </Link>
  );
}

function FeaturedTrendingSection() {
  const { categories: apiCategories } = useCategories();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const categoryBySlug = useMemo(() => {
    const m = new Map();
    for (const c of apiCategories || []) {
      m.set(c.slug, c);
    }
    return m;
  }, [apiCategories]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await listPublicBusinesses();
        if (!cancelled) {
          setBusinesses(Array.isArray(data.businesses) ? data.businesses : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(getApiErrorMessage(e));
          setBusinesses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { featuredRow, trendingRow } = useMemo(() => {
    const list = businesses.slice();
    const featured = list
      .filter((b) => b.featured === true)
      .slice(0, MAX_FEATURED);
    const featuredIds = new Set(featured.map((b) => b.id));
    const trending = list
      .filter((b) => !featuredIds.has(b.id))
      .sort((a, b) => {
        const rc = (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
        if (rc !== 0) return rc;
        return (b.rating ?? 0) - (a.rating ?? 0);
      })
      .slice(0, MAX_TRENDING);
    return { featuredRow: featured, trendingRow: trending };
  }, [businesses]);

  const resolveCategory = (b) => {
    const cat = categoryBySlug.get(b.category);
    return {
      name: cat?.name || b.category,
      iconKey: cat?.iconKey || "other",
    };
  };

  if (loading) {
    return (
      <section
        className="home-ft spacing-section"
        aria-labelledby="home-ft-title"
      >
        <div className="container home-ft__inner">
          <div className="home-ft__header">
            <div className="home-ft__skeleton home-ft__skeleton--eyebrow" />
            <div className="home-ft__skeleton home-ft__skeleton--title" />
          </div>
          <div className="home-ft__scroll home-ft__scroll--skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="home-ft-card home-ft-card--skeleton" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || businesses.length === 0) {
    return null;
  }

  const showFeatured = featuredRow.length > 0;
  const showTrending = trendingRow.length > 0;

  if (!showFeatured && !showTrending) {
    return null;
  }

  return (
    <section
      id="home-featured-trending"
      className="home-ft spacing-section"
      aria-labelledby="home-ft-title"
    >
      <div className="container home-ft__inner">
        <header className="home-ft__header">
          <p className="home-ft__eyebrow">Discover</p>
          <h2 id="home-ft-title" className="home-ft__title">
            Featured &amp; trending
          </h2>
          <p className="home-ft__subtitle">
            Quality highlights and popular listings on Appointly right now — open
            a profile to book in seconds.
          </p>
        </header>

        {showFeatured ? (
          <div className="home-ft__block">
            <div className="home-ft__row-head">
              <h3 className="home-ft__row-title">
                <HiOutlineSparkles size={20} className="home-ft__row-icon" />
                Featured
              </h3>
              <p className="home-ft__row-desc">
                Top-rated businesses with a strong review history — our
                spotlight picks.
              </p>
            </div>
            <div className="home-ft__scroll" role="list">
              {featuredRow.map((b) => (
                <FeaturedCard
                  key={`f-${b.id}`}
                  business={b}
                  categoryLabel={resolveCategory(b)}
                  badge="featured"
                />
              ))}
            </div>
          </div>
        ) : null}

        {showTrending ? (
          <div className={`home-ft__block ${showFeatured ? "home-ft__block--trending" : ""}`}>
            <div className="home-ft__scroll" role="list">
              {trendingRow.map((b) => (
                <FeaturedCard
                  key={`t-${b.id}`}
                  business={b}
                  categoryLabel={resolveCategory(b)}
                  badge="trending"
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="home-ft__cta">
          <Link to="/book" className="home-ft__link-all">
            Browse all businesses
            <span aria-hidden> →</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default FeaturedTrendingSection;
