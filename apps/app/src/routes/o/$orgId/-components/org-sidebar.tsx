import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@everband/ui/components/menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@everband/ui/components/sidebar";
import {
  BellIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretUpDownIcon,
  CheckIcon,
  GearIcon,
  type Icon,
  MusicNotesIcon,
  PlusIcon,
  SignOutIcon,
  SquaresFourIcon,
  UploadSimpleIcon,
  UserCircleIcon,
  UsersIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { logout } from "~/server/auth.ts";

// 侧边栏可达的组织内路由；全部只需 orgId 参数，便于统一渲染与匹配
type OrgNavPath =
  | "/o/$orgId"
  | "/o/$orgId/events"
  | "/o/$orgId/rehearsals"
  | "/o/$orgId/notifications"
  | "/o/$orgId/members"
  | "/o/$orgId/groups"
  | "/o/$orgId/import"
  | "/o/$orgId/settings";

type NavItem = {
  to: OrgNavPath;
  label: string;
  icon: Icon;
  // 精确匹配：Overview 是父路径，模糊匹配会导致它永远高亮
  exact?: boolean;
};

const MAIN_ITEMS: NavItem[] = [
  { to: "/o/$orgId", label: "Overview", icon: SquaresFourIcon, exact: true },
  { to: "/o/$orgId/events", label: "Events", icon: CalendarBlankIcon },
  { to: "/o/$orgId/rehearsals", label: "Rehearsals", icon: MusicNotesIcon },
  { to: "/o/$orgId/notifications", label: "Notifications", icon: BellIcon },
];

const MANAGE_ITEMS: NavItem[] = [
  { to: "/o/$orgId/members", label: "Members", icon: UsersIcon },
  { to: "/o/$orgId/groups", label: "Groups", icon: UsersThreeIcon },
  { to: "/o/$orgId/import", label: "Import", icon: UploadSimpleIcon },
  { to: "/o/$orgId/settings", label: "Settings", icon: GearIcon },
];

export type OrgSummary = {
  orgId: string;
  name: string;
  type: string;
  role: string;
};

export type OrgSidebarProps = {
  org: { id: string; name: string; type: string };
  role: string;
  email: string;
  orgs: OrgSummary[];
};

// 移动端侧边栏是 Sheet 浮层，导航后必须自己收起，否则新页面被浮层盖住
function useDismissOnNavigate(): () => void {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
}

export function OrgSidebar({ org, role, email, orgs }: OrgSidebarProps): React.ReactElement {
  const isStaff = role === "owner" || role === "staff";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher currentOrgId={org.id} name={org.name} type={org.type} orgs={orgs} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <NavMenu items={MAIN_ITEMS} orgId={org.id} />
        </SidebarGroup>
        {isStaff && (
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <NavMenu items={MANAGE_ITEMS} orgId={org.id} />
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={email} orgId={org.id} role={role} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavMenu({ items, orgId }: { items: NavItem[]; orgId: string }): React.ReactElement {
  const matchRoute = useMatchRoute();
  const dismiss = useDismissOnNavigate();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = Boolean(
          matchRoute({ to: item.to, params: { orgId }, fuzzy: !item.exact }),
        );
        return (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton
              isActive={isActive}
              onClick={dismiss}
              tooltip={item.label}
              render={<Link to={item.to} params={{ orgId }} />}
            >
              <item.icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function OrgSwitcher({
  currentOrgId,
  name,
  type,
  orgs,
}: {
  currentOrgId: string;
  name: string;
  type: string;
  orgs: OrgSummary[];
}): React.ReactElement {
  const dismiss = useDismissOnNavigate();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={name}
                className="data-popup-open:bg-sidebar-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <BuildingsIcon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground capitalize">{type}</span>
                </span>
                <CaretUpDownIcon className="ms-auto" />
              </SidebarMenuButton>
            }
          />
          <MenuPopup align="start" className="min-w-56" side="bottom" sideOffset={4}>
            {orgs.map((item) => (
              <MenuLinkItem
                key={item.orgId}
                onClick={dismiss}
                render={<Link to="/o/$orgId" params={{ orgId: item.orgId }} />}
              >
                <span className="truncate">{item.name}</span>
                {item.orgId === currentOrgId && <CheckIcon className="ms-auto" />}
              </MenuLinkItem>
            ))}
            {orgs.length > 0 && <MenuSeparator />}
            <MenuLinkItem onClick={dismiss} render={<Link to="/new-org" />}>
              <PlusIcon />
              <span>Create organization</span>
            </MenuLinkItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({
  email,
  orgId,
  role,
}: {
  email: string;
  orgId: string;
  role: string;
}): React.ReactElement {
  const navigate = useNavigate();
  const dismiss = useDismissOnNavigate();

  async function handleSignOut(): Promise<void> {
    await logout();
    await navigate({ to: "/login" });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={email}
                className="data-popup-open:bg-sidebar-accent"
              >
                <UserCircleIcon className="size-8 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate">{email}</span>
                  <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {role}
                  </span>
                </span>
              </SidebarMenuButton>
            }
          />
          <MenuPopup align="start" className="min-w-56" side="top" sideOffset={4}>
            <MenuLinkItem
              onClick={dismiss}
              render={<Link to="/o/$orgId/account" params={{ orgId }} />}
            >
              <UserCircleIcon />
              <span>Account</span>
            </MenuLinkItem>
            <MenuSeparator />
            <MenuItem onClick={handleSignOut}>
              <SignOutIcon />
              <span>Sign out</span>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
