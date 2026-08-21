import{integer,primaryKey,sqliteTable,text}from"drizzle-orm/sqlite-core";

export const appUsers=sqliteTable("app_users",{
 email:text("email").primaryKey(),userId:text("user_id").unique(),name:text("name"),role:text("role",{enum:["admin","user"]}).notNull().default("user"),status:text("status",{enum:["active","disabled"]}).notNull().default("active"),monthlyLimit:integer("monthly_limit").notNull().default(50),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
});
export const apiUsage=sqliteTable("api_usage",{email:text("email").notNull().references(()=>appUsers.email,{onDelete:"cascade"}),period:text("period").notNull(),used:integer("used").notNull().default(0) },table=>[primaryKey({columns:[table.email,table.period]})]);
export const driveExports=sqliteTable("drive_exports",{
 id:text("id").primaryKey(),email:text("email").notNull().references(()=>appUsers.email,{onDelete:"cascade"}),localMeetingId:text("local_meeting_id").notNull(),meetingTitle:text("meeting_title").notNull(),folderId:text("folder_id").notNull(),folderUrl:text("folder_url").notNull(),filesJson:text("files_json").notNull(),createdAt:text("created_at").notNull()
});
export const googleDriveIntegrations=sqliteTable("google_drive_integrations",{
 id:text("id").primaryKey(),accountEmail:text("account_email").notNull(),encryptedRefreshToken:text("encrypted_refresh_token").notNull(),rootFolderId:text("root_folder_id").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
});
