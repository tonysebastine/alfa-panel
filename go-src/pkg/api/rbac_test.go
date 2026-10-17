package api

import ("net/http/httptest"; "testing")


func TestRolePermissions(t *testing.T) {
	if !HasPermission("owner", PermSystemManage) { t.Fatal("owner should have system management") }
	if !HasPermission("admin", PermSitesDelete) { t.Fatal("admin should manage sites") }
	if HasPermission("viewer", PermSitesDelete) { t.Fatal("viewer must not delete sites") }
	if !HasPermission("developer", PermSitesDeploy) { t.Fatal("developer should deploy sites") }
}

func TestSitePermissionForRequest(t *testing.T) {
	cases := []struct{ method, path, want string }{
		{"GET","/api/v1/sites",PermSitesRead},
		{"POST","/api/v1/sites",PermSitesCreate},
		{"POST","/api/v1/sites/a.example.com/tomcat/deploy-war",PermSitesDeploy},
		{"POST","/api/v1/sites/a.example.com/restart",PermSitesOperate},
		{"DELETE","/api/v1/sites/a.example.com/delete",PermSitesDelete},
	}
	for _, tc := range cases {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		if got:=SitePermissionForRequest(r); got!=tc.want { t.Fatalf("%s %s: got %s want %s",tc.method,tc.path,got,tc.want) }
	}
}
