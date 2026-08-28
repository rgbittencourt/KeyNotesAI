import{index,integer,primaryKey,sqliteTable,text,uniqueIndex}from"drizzle-orm/sqlite-core";

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
export const trelloSettings=sqliteTable("trello_settings",{
 id:text("id").primaryKey(),boardId:text("board_id").notNull(),boardName:text("board_name").notNull(),listId:text("list_id").notNull(),listName:text("list_name").notNull(),updatedAt:text("updated_at").notNull()
});
export const trelloExports=sqliteTable("trello_exports",{
 id:text("id").primaryKey(),email:text("email").notNull().references(()=>appUsers.email,{onDelete:"cascade"}),localMeetingId:text("local_meeting_id").notNull(),cardId:text("card_id").notNull(),cardUrl:text("card_url").notNull(),checklistId:text("checklist_id"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},table=>[uniqueIndex("idx_trello_exports_meeting").on(table.email,table.localMeetingId)]);
export const meetings=sqliteTable("meetings",{
 id:text("id").notNull(),email:text("email").notNull().references(()=>appUsers.email,{onDelete:"cascade"}),dataJson:text("data_json").notNull(),audioFileId:text("audio_file_id"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},table=>[primaryKey({columns:[table.email,table.id]}),index("idx_meetings_email_updated").on(table.email,table.updatedAt)]);
