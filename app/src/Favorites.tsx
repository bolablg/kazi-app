import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowUpRight, ChevronDown, Star, Users, X } from "lucide-react";
import { favoriteItems, type FavoriteItem } from "../shared/favorites";
import { projectPath } from "../shared/ids";
import { useData } from "./data";
import { useUI, cx } from "./components";
import { projectStyle } from "./projectColors";
import { useTeamSelection } from "./teamSelection";

function useFavorites() {
  const { state, captureState, actorId } = useData();
  return favoriteItems(captureState ?? state, actorId);
}
function FavoriteShortcut({
  item,
  onSelect,
}: {
  item: FavoriteItem;
  onSelect?: () => void;
}) {
  const { setTeam, teamId } = useData();
  const selectTeam = useTeamSelection();
  const content = (
    <>
      {item.kind === "project" ? (
        <i
          className={item.project.color}
          style={{
            ...projectStyle(item.project.color),
            background: "var(--project-accent)",
          }}
        />
      ) : (
        <span className="team-shortcut-icon">
          <Users size={14} />
        </span>
      )}
      <span className="favorite-name">{item.name}</span>
      <span className="favorite-kind" data-kind={item.kind}>
        {item.kind === "project" ? "Project" : "Team"}
      </span>
    </>
  );
  if (item.kind === "team")
    return (
      <button
        aria-label={`${item.name} Team`}
        className={cx(
          "sidebar-project sidebar-favorite",
          teamId === item.id && "active",
        )}
        title={item.name + " · Team"}
        onClick={() => {
          selectTeam(item.id, "/");
          onSelect?.();
        }}
      >
        {content}
      </button>
    );
  return (
    <NavLink
      aria-label={`${item.name} Project`}
      className="sidebar-project sidebar-favorite"
      title={item.name + " · Project"}
      to={projectPath(item.id)}
      onClick={() => {
        if (teamId !== "all" && teamId !== item.teamId) setTeam(item.teamId);
        onSelect?.();
      }}
    >
      {content}
    </NavLink>
  );
}

export function SidebarFavorites({ onSelect }: { onSelect?: () => void }) {
  const favorites = useFavorites(),
    [open, setOpen] = useState(true);
  return (
    <section className="sidebar-favorites" aria-label="Favorites">
      <div className="sidebar-project-heading">
        <button
          className="sidebar-favorites-toggle nav-group-label"
          aria-expanded={open}
          aria-controls="favorite-items"
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={15} className={open ? "" : "collapsed"} />
          Favorites
        </button>
      </div>
      <div id="favorite-items" hidden={!open}>
        <nav aria-label="Favorite shortcuts">
          {favorites.slice(0, 5).map((item) => (
            <FavoriteShortcut
              key={item.kind + item.id}
              item={item}
              onSelect={onSelect}
            />
          ))}
        </nav>
        {favorites.length > 5 && (
          <Link className="sidebar-more" to="/favorites" onClick={onSelect}>
            More favorites
            <ArrowUpRight size={14} />
          </Link>
        )}
        {!favorites.length && (
          <p className="sidebar-favorites-empty">
            Star projects or teams to keep them here.
          </p>
        )}
      </div>
    </section>
  );
}

export function TeamFavoriteButton({
  team,
}: {
  team: { id: string; name: string; kind: string; favoriteAt?: number };
}) {
  const { dispatch, online } = useData(),
    { run } = useUI(),
    [saving, setSaving] = useState(false);
  if (team.kind !== "team") return null;
  const favorite = team.favoriteAt !== undefined;
  return (
    <button
      className="icon-button project-favorite"
      aria-label={`${favorite ? "Unfavorite" : "Favorite"} team ${team.name}`}
      aria-pressed={favorite}
      title={favorite ? "Remove team from favorites" : "Add team to favorites"}
      disabled={!online || saving}
      onClick={async () => {
        setSaving(true);
        try {
          await run(
            () =>
              dispatch(
                { type: "favorite_team", favorite: !favorite },
                { teamId: team.id },
              ),
            favorite
              ? "Team removed from favorites"
              : "Team added to favorites",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <Star size={17} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
}

export function TeamScope() {
  const { teamId, teams } = useData(),
    select = useTeamSelection();
  const team = teams.find((t) => t.id === teamId);
  return (
    <span className="team-scope-label" title="Current team filter">
      <span>
        {teamId === "all"
          ? "All teams"
          : team?.kind === "personal"
            ? "Personal"
            : team?.name}
      </span>
      {teamId !== "all" && (
        <button
          className="icon-button"
          aria-label="Clear team filter"
          title="Show all teams"
          onClick={() => select("all")}
        >
          <X size={13} />
        </button>
      )}
    </span>
  );
}

export function FavoritesPage() {
  const favorites = useFavorites(),
    { dispatch, online } = useData(),
    { run } = useUI();
  return (
    <div className="page favorites-page">
      <div className="page-heading">
        <div>
          <h1>Favorites</h1>
          <p>
            Your starred projects and teams, with the most recently added first.
          </p>
        </div>
      </div>
      {favorites.length ? (
        <ul className="favorites-directory">
          {favorites.map((item) => (
            <li key={item.kind + item.id}>
              <FavoriteShortcut item={item} />
              <button
                className="icon-button project-favorite"
                aria-label={`Unfavorite ${item.kind} ${item.name}`}
                aria-pressed="true"
                disabled={!online}
                onClick={() =>
                  void run(
                    () =>
                      dispatch(
                        item.kind === "team"
                          ? { type: "favorite_team", favorite: false }
                          : {
                              type: "favorite_project",
                              projectId: item.id,
                              favorite: false,
                            },
                        { teamId: item.teamId },
                      ),
                    "Removed from favorites",
                  )
                }
              >
                <Star size={17} fill="currentColor" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="favorites-empty">
          <Star size={24} />
          <h2>Keep your work close</h2>
          <p>Star a project or team to add it here and to your sidebar.</p>
          <div className="integration-actions">
            <Link className="button secondary" to="/projects">
              Browse projects
            </Link>
            <Link className="button secondary" to="/teams">
              Team & people
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
