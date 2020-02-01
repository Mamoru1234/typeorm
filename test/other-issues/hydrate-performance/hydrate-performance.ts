import "reflect-metadata";
import { closeTestingConnections, createTestingConnections, reloadTestingDatabases } from "../../utils/test-utils";
import { Connection, DatabaseType } from "../../../src";
import { Post } from "./entity/Post";
import { fail } from "assert";

async function butchInsert(connection: Connection, posts: Post[], maxButchSize: number): Promise<void> {
    if (maxButchSize < 100) {
        console.warn("Suspicious butch size: ", maxButchSize);
    }
    let postsLeft = posts;
    while (postsLeft.length > 0) {
        await connection.manager.insert(Post, postsLeft.slice(0, maxButchSize));
        postsLeft = postsLeft.slice(maxButchSize);
    }
}

describe("other issues > hydration performance", () => {

    let connections: Connection[];
    const enabledDrivers: DatabaseType[] = ["mysql", "postgres"];
    before(async () => connections = await createTestingConnections({
        entities: [__dirname + "/entity/*{.js,.ts}"],
        enabledDrivers,
    }));
    beforeEach(() => reloadTestingDatabases(connections));
    after(() => closeTestingConnections(connections));
    describe("simple entity hydration", () => {
        enabledDrivers.forEach((driverName) => {
           it(driverName, async () => {
               const connection = connections.find((it) => it.name === driverName);
               if (!connection) {
                   fail(`Connection with name ${driverName} not found`);
                   return;
               }

               // insert few posts first
               const posts: Post[] = [];
               for (let i = 1; i <= 100000; i++) {
                   posts.push(new Post("Post #" + i));
               }
               const butchSize = connection.name === "postgres" ? 34464 : posts.length;
               await butchInsert(connection, posts, butchSize);

               // select them using raw sql
               console.time(`select using raw sql ${connection.name}`);
               const loadedRawPosts = await connection.manager.query("SELECT * FROM post");
               loadedRawPosts.length.should.be.equal(100000);
               console.timeEnd(`select using raw sql ${connection.name}`);

               // now select them using ORM
               console.time(`select using ORM ${connection.name}`);
               const loadedOrmPosts = await connection.manager.find(Post);
               loadedOrmPosts.length.should.be.equal(100000);
               console.timeEnd(`select using ORM ${connection.name}`);
           });
        });
    });
});
