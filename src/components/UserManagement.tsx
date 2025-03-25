import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface User {
  id: string;
  email: string;
  isAdmin: boolean;
  permissions: {
    portfolio: boolean;
    crypto: boolean;
    reporting: boolean;
    settings: boolean;
    websocketLogs: boolean;
    research: boolean;
  };
}

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Mock data for demonstration purposes
  useEffect(() => {
    // In a real implementation, this would fetch from an API
    const mockUsers: User[] = [
      {
        id: currentUser?.id || 'admin-id',
        email: currentUser?.email || 'admin@example.com',
        isAdmin: true,
        permissions: {
          portfolio: true,
          crypto: true,
          reporting: true,
          settings: true,
          websocketLogs: true,
          research: true,
        }
      },
      {
        id: 'user-1',
        email: 'user1@example.com',
        isAdmin: false,
        permissions: {
          portfolio: true,
          crypto: true,
          reporting: true,
          settings: false,
          websocketLogs: false,
          research: false,
        }
      },
      {
        id: 'user-2',
        email: 'user2@example.com',
        isAdmin: false,
        permissions: {
          portfolio: true,
          crypto: false,
          reporting: true,
          settings: false,
          websocketLogs: false,
          research: true,
        }
      }
    ];

    setUsers(mockUsers);
    setLoading(false);
  }, [currentUser]);

  const handlePermissionChange = (userId: string, permission: keyof User['permissions'], value: boolean) => {
    // In a real implementation, this would update the database
    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.id === userId 
          ? { ...user, permissions: { ...user.permissions, [permission]: value } } 
          : user
      )
    );

    toast({
      title: "Permission Updated",
      description: `Permission updated successfully.`,
    });
  };

  if (loading) {
    return <div>Loading user data...</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          Manage user access to different sections of the application
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Portfolio</TableHead>
              <TableHead>Crypto</TableHead>
              <TableHead>Reporting</TableHead>
              <TableHead>Settings</TableHead>
              <TableHead>WebSocket Logs</TableHead>
              <TableHead>Research</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id}>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {user.isAdmin ? (
                    <Badge variant="default" className="bg-purple-600">Admin</Badge>
                  ) : (
                    <Badge variant="outline">User</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={user.permissions.portfolio} 
                    onCheckedChange={(checked) => handlePermissionChange(user.id, 'portfolio', checked)}
                    disabled={user.isAdmin} // Admin always has all permissions
                  />
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={user.permissions.crypto} 
                    onCheckedChange={(checked) => handlePermissionChange(user.id, 'crypto', checked)}
                    disabled={user.isAdmin}
                  />
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={user.permissions.reporting} 
                    onCheckedChange={(checked) => handlePermissionChange(user.id, 'reporting', checked)}
                    disabled={user.isAdmin}
                  />
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={user.permissions.settings} 
                    onCheckedChange={(checked) => handlePermissionChange(user.id, 'settings', checked)}
                    disabled={user.isAdmin}
                  />
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={user.permissions.websocketLogs} 
                    onCheckedChange={(checked) => handlePermissionChange(user.id, 'websocketLogs', checked)}
                    disabled={user.isAdmin}
                  />
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={user.permissions.research} 
                    onCheckedChange={(checked) => handlePermissionChange(user.id, 'research', checked)}
                    disabled={user.isAdmin}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default UserManagement;